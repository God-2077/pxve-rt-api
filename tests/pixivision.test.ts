import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appRequest, installFetch } from './helpers.ts'

const LIST_HTML = `<!doctype html><html><body>
  <div class="main-column-container">
    <div class="_article-card">
      <div class="_thumbnail" style="background-image: url(https://i.pximg.net/thumb.jpg)"></div>
      <h3 class="arc__title"><a href="https://www.pixivision.net/zh/a/11220" data-gtm-label="11220">Title - Sub</a></h3>
      <time class="_date" datetime="2026-01-01"></time>
      <ul class="tls__list-item-container"><li><a href="/zh/t/123">tag123</a></li></ul>
    </div>
  </div>
  <div class="alc__articles-list-group--ranking">
    <div class="_article-summary-card">
      <div class="_thumbnail" style="background-image: url(https://i.pximg.net/rank.jpg)"></div>
      <a class="asc__title-link" href="/zh/a/1" data-gtm-label="1">Rank - Side</a>
    </div>
  </div>
  <div class="_articles-list-card" data-gtm-category="Osusume Area">
    <div class="_article-summary-card">
      <div class="_thumbnail" style="background-image: url(https://i.pximg.net/rec.jpg)"></div>
      <a class="asc__title-link" href="/zh/a/2" data-gtm-label="2">Recommend - Side</a>
    </div>
  </div>
</body></html>`

const DETAIL_HTML = `<!doctype html><html><body>
  <h1 class="am__title">Detail Title</h1>
  <div class="_article-illust-eyecatch"><img src="https://i.pximg.net/cover.jpg"></div>
  <div class="_feature-article-body__article_thumbnail"></div>
  <p class="_feature-article-body__paragraph">Detail Description</p>
  <div class="am__body"><p>Content <a href="https://www.pixiv.net/zh/artworks/42" target="_blank">link</a></p></div>
  <time class="_date">2026-01-02</time>
  <div class="article-item _feature-article-body__pixiv_illust">
    <div class="am__work__title"><a href="/zh/artworks/42">Work Title</a></div>
    <div class="am__work__user-name"><a href="/zh/users/7">User Name</a></div>
    <img class="am__work__illust" src="https://i.pximg.net/work.jpg">
    <img class="am__work__uesr-icon" src="https://i.pximg.net/avatar.jpg">
  </div>
  <ul class="_tag-list"><li><a href="/zh/t/99">tag99</a></li></ul>
  <div class="_related-articles" data-gtm-category="Related Article Latest">
    <a class="rla__heading-link" href="/zh/t/5" data-gtm-label="LatestTag">Latest</a>
    <div class="_article-summary-card-related">
      <div class="_thumbnail" style="background-image: url(https://i.pximg.net/latest.jpg)"></div>
      <div class="ascr__title-container"><a href="/zh/a/123">Latest Article</a></div>
    </div>
  </div>
  <div class="_related-articles" data-gtm-category="Related Article Popular">
    <a class="rla__heading-link" href="/zh/t/6" data-gtm-label="PopularTag">Popular</a>
    <div class="_article-summary-card-related">
      <div class="_thumbnail" style="background-image: url(https://i.pximg.net/popular.jpg)"></div>
      <div class="ascr__title-container"><a href="/zh/a/124">Popular Article</a></div>
    </div>
  </div>
</body></html>`

function htmlResponse(html: string) {
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

test('pixivision list parses articles, rank and recommend', async () => {
  const restore = installFetch(() => htmlResponse(LIST_HTML))
  try {
    const res = await appRequest('/api/pixivision/list?type=illustration&lang=zh')
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'max-age=21600')

    const body = await res.json()
    assert.equal(body.articles.length, 1)
    assert.equal(body.articles[0].id, '11220')
    assert.equal(body.articles[0].title, 'Title - Sub')
    assert.equal(body.articles[0].article_url, 'https://www.pixivision.net/zh/a/11220')
    assert.equal(body.articles[0].thumbnail, 'https://i.pximg.net/thumb.jpg')
    assert.equal(body.articles[0].publish_date, '2026-01-01')
    assert.deepEqual(body.articles[0].tags, [{ id: '123', name: 'tag123' }])
    assert.equal(body.rank[0].id, '1')
    assert.equal(body.recommend[0].id, '2')
  } finally {
    restore()
  }
})

test('pixivision detail returns article content and items', async () => {
  const restore = installFetch(() => htmlResponse(DETAIL_HTML))
  try {
    const res = await appRequest('/api/pixivision/11220?lang=zh')
    assert.equal(res.status, 200)

    const body = await res.json()
    assert.equal(body.title, 'Detail Title')
    assert.equal(body.cover, 'https://i.pximg.net/cover.jpg')
    assert.equal(body.desc, 'Detail Description')
    assert.equal(body.items[0].illust_id, '42')
    assert.equal(body.items[0].user_id, '7')
    assert.equal(body.tags[0].name, 'tag99')
    assert.equal(body.related_latest.tag_name, 'LatestTag')
    assert.equal(body.related_recommend.items[0].id, '124')
  } finally {
    restore()
  }
})

test('pixivision detail HTML endpoint', async () => {
  const restore = installFetch(() => htmlResponse(DETAIL_HTML))
  try {
    const res = await appRequest('/api/pixivision/detail?id=11220&lang=zh')
    assert.equal(res.status, 200)

    const body = await res.json()
    assert.equal(body.title, 'Detail Title')
    assert.equal(body.date, '2026-01-02')
    assert.match(body.content, /pixiv\.net\/artworks\/42/)
  } finally {
    restore()
  }
})

test('pixivision validates id and upstream errors', async () => {
  const invalid = await appRequest('/api/pixivision/not-a-number')
  assert.equal(invalid.status, 400)

  const invalidType = await appRequest('/api/pixivision/list?type=unknown')
  assert.equal(invalidType.status, 400)

  const restore = installFetch(() => new Response('bad', { status: 500 }))
  try {
    const res = await appRequest('/api/pixivision')
    assert.equal(res.status, 502)
  } finally {
    restore()
  }
})
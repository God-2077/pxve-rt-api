import { load, type Cheerio, type CheerioAPI } from 'cheerio'
import { BROWSER_UA, getUpstreamTimeoutMs } from '../config.ts'
import { UpstreamError } from '../lib/errors.ts'
import { objectToQueryString } from './pixiv-now.ts'

const LANGUAGES = ['en', 'zh-tw', 'zh', 'ko', 'th', 'ms', 'ja']

function getLang(lang: string): string {
  return LANGUAGES.find(e => String(lang).toLowerCase().includes(e)) || 'en'
}

async function fetchHtml(url: string, extraHeaders?: Record<string, string>): Promise<string> {
  const response = await fetch(url, {
    headers: {
      ...extraHeaders,
      'user-agent': BROWSER_UA,
    },
    signal: AbortSignal.timeout(getUpstreamTimeoutMs()),
  })
  if (!response.ok) throw new UpstreamError(`Upstream responded ${response.status}`)
  return await response.text()
}

export async function fetchPixivisionList(query: Record<string, any>) {
  const { type = 'illustration', lang = 'zh', page } = query
  const params = page ? { p: page } : {}
  const url = `https://www.pixivision.net/${getLang(lang)}/c/${type}${objectToQueryString(params)}`
  const $ = load(await fetchHtml(url))
  const data: any = {}

  data.articles = $('.main-column-container ._article-card')
    .toArray()
    .map(el => {
      const $this = $(el)
      return parseArticle($, $this, $this.find('.arc__title a'))
    })

  if (!page) {
    data.rank = $('.alc__articles-list-group--ranking ._article-summary-card')
      .toArray()
      .map(el => parseSideItem($(el)))

    data.recommend = $('._articles-list-card[data-gtm-category="Osusume Area"] ._article-summary-card')
      .toArray()
      .map(el => parseSideItem($(el)))
  }

  return data
}

function dataToString(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

function articleUrl(href?: string): string {
  if (!href) return ''
  if (/^https?:\/\//i.test(href)) return href
  if (href.startsWith('//')) return `https:${href}`
  return `https://www.pixivision.net${href}`
}

function parseArticle($: CheerioAPI, $this: Cheerio<any>, $link: Cheerio<any>) {
  return {
    id: dataToString($link.data('gtm-label')),
    title: $link.text(),
    pure_title: $link.text().split('-')[1] || '',
    thumbnail: $this
      .find('._thumbnail')
      .css('background-image')
      ?.match(/url\((.*)\)/)?.[1],
    article_url: articleUrl($link.attr('href')),
    publish_date: $this.find('time._date').attr('datetime') ?? $this.find('_date').attr('datetime'),
    tags: $this
      .find('.tls__list-item-container a')
      .toArray()
      .map(el => {
        const $el = $(el)
        return {
          id: $el.attr('href')?.match(/(\d+)/)?.[1],
          name: $el.text(),
        }
      }),
  }
}

function parseSideItem($this: Cheerio<any>) {
  const $link = $this.find('.asc__title-link')
  return {
    id: dataToString($link.data('gtm-label')),
    title: $link.text(),
    pure_title: $link.text().split('-')[1] || '',
    thumbnail: $this
      .find('._thumbnail')
      .css('background-image')
      ?.match(/url\((.*)\)/)?.[1],
    article_url: articleUrl($link.attr('href')),
    publish_date: null,
    tags: [],
  }
}

export async function fetchPixivisionDetail(id: string, query: Record<string, any>) {
  const { lang = 'zh' } = query
  const url = `https://www.pixivision.net/${getLang(lang)}/a/${id}`
  const $ = load(await fetchHtml(url))
  const data: any = {}

  data.title = $('.am__title').text()
  data.cover = $('._article-illust-eyecatch img').attr('src')
  data.desc = $('._feature-article-body__article_thumbnail + ._feature-article-body__paragraph').text()

  data.items = $('.article-item._feature-article-body__pixiv_illust')
    .toArray()
    .map(el => {
      const $this = $(el)
      const $titleLink = $this.find('.am__work__title a')
      const $userLink = $this.find('.am__work__user-name a')
      return {
        title: $titleLink.text(),
        illust_id: $titleLink.attr('href')?.match(/(\d+)/)?.[1],
        illust_url: $this.find('.am__work__illust').attr('src'),
        user_id: $userLink.attr('href')?.match(/(\d+)/)?.[1],
        user_name: $userLink.text(),
        user_avatar: $this.find('.am__work__uesr-icon').attr('src'),
      }
    })

  data.tags = parseTags($)
  data.related_latest = parseRelated($, 'Related Article Latest')
  data.related_recommend = parseRelated($, 'Related Article Popular')

  return data
}

export async function fetchPixivisionDetailContent(query: Record<string, any>) {
  const { id, lang = 'zh' } = query
  const url = `https://www.pixivision.net/${getLang(lang)}/a/${id}`
  const $ = load(await fetchHtml(url, { 'accept-language': String(lang) }))
  const data: any = {}

  $('a').removeAttr('target')

  data.title = $('.am__title').text()
  data.date = $('time._date').text()
  data.content = $('.am__body')
    .html()
    ?.replace(/www.pixiv.net\/\w+\/artworks/g, 'www.pixiv.net/artworks')
    ?.replace(/www.pixiv.net\/\w+\/users/g, 'www.pixiv.net/users')

  data.tags = parseTags($)
  data.related_latest = parseRelated($, 'Related Article Latest')
  data.related_recommend = parseRelated($, 'Related Article Popular')

  return data
}

function parseTags($: CheerioAPI) {
  return $('._tag-list a')
    .toArray()
    .map(el => {
      const $el = $(el)
      return {
        id: $el.attr('href')?.match(/(\d+)/)?.[1],
        name: $el.text(),
      }
    })
}

function parseRelated($: CheerioAPI, category: string) {
  const $related = $(`._related-articles[data-gtm-category="${category}"]`)
  const $tagLink = $related.find('.rla__heading-link')
  return {
    tag_name: dataToString($tagLink.data('gtm-label')),
    tag_id: $tagLink.attr('href')?.match(/(\d+)/)?.[1],
    items: $related
      .find('._article-summary-card-related')
      .toArray()
      .map(el => {
        const $el = $(el)
        const $link = $el.find('.ascr__title-container > a')
        return {
          id: $link.attr('href')?.match(/(\d+)/)?.[1],
          title: $link.text(),
          thumbnail: $el
            .find('._thumbnail')
            .css('background-image')
            ?.match(/url\((.*)\)/)?.[1],
        }
      }),
  }
}
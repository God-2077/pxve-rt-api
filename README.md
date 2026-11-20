# pxve-api-vercel

面向 **RefreshToken 模式 pixiv-viewer-app** 的轻量 API，基于 Hono，部署目标为 Vercel。

只保留核心浏览能力：App API 透明代理、pixiv-now、pixivision、通用代理、根路径 URL 代理。不实现 `/api/pixiv/{key}`、翻译、以图搜图、X 媒体、图片代理、失效作品恢复、云同步等非核心功能。

## 路由

| 路由 | 说明 |
|---|---|
| `GET /` | 健康检查与路由列表 |
| `GET\|POST /pixiv-oauth/*` | 透明转发到 `oauth.secure.pixiv.net` |
| `GET\|POST /pixiv-app-api/*` | 透明转发到 `app-api.pixiv.net` |
| `GET\|POST /api/pixiv-now/http/*` | Pixiv Web API 透传 |
| `GET /api/pixiv-now/ranking` | Web 榜单 |
| `GET /api/pixivision` | Pixivision 首页 |
| `GET /api/pixivision/list` | Pixivision 分类列表 |
| `GET /api/pixivision/detail` | Pixivision 详情 HTML |
| `GET /api/pixivision/:id` | Pixivision 文章详情 |
| `GET\|POST /proxy/*` | COMMON_PROXY 通用代理（带 SSRF 防护） |
| `GET /https://www.pixiv.net/*` | 根路径 URL 代理（Stories / Collections） |
| `GET /https://www.pixivision.net/*` | 根路径 URL 代理（Pixivision Story） |

同时兼容根代理路径被归一化后的单斜杠形式：`/https:/www.pixiv.net/*`、`/https:/www.pixivision.net/*`。

## 本地开发

要求 Node.js >= 22.18（本地使用 Node 24）和全局 `vercel` CLI：

```bash
pnpm install
pnpm dev:local
# 等价于：vercel dev --local --listen 3000
```

不依赖 Vercel 账号或 `api.vercel.com`。如需环境变量，复制 `.env.example` 为 `.env.local` 后填写；也可以直接在 shell 中设置。

```bash
pnpm type-check
pnpm test
```

> 由于当前环境无法访问 Pixiv 网络，本地 smoke test 中上游接口返回 `502` 属于预期结果；只要不是 `404` 即说明路由已命中。

## 配置

| 变量 | 说明 |
|---|---|
| `PIXIV_COOKIE` | 可选，建议配置。用于 Web 侧只读请求兜底，使用专用账号 |
| `ACCEPT_DOMAINS` | 可选。Origin/Referer 主机白名单，启用时必须包含 App 来源 |
| `UA_BLACKLIST` | 可选。User-Agent 黑名单，不要包含 App UA 片段 |
| `PROXY_ALLOW_DOMAINS` | 可选。`/proxy/*` 域名白名单 |
| `PROXY_BLOCK_DOMAINS` | 可选。`/proxy/*` 域名黑名单 |
| `PROXY_BLOCK_PRIVATE` | 默认 `1`，正式环境必须保持 |
| `PROXY_DNS_CHECK` | 默认 `1`，正式环境必须保持；仅离线测试可设 `0` |
| `ROOT_PROXY_ALLOW_DOMAINS` | 根代理主机白名单，默认 `www.pixiv.net,www.pixivision.net` |
| `MAX_DOWNLOAD_BYTES` | 上游响应大小上限，默认 20 MiB |
| `UPSTREAM_TIMEOUT_MS` | 上游超时，默认 25000 ms |

**不要设置**：

- `API_TOKEN`：App 无法发送 `X-Api-Token`，设置后所有请求会 401。
- `PIXIV_ACCOUNT_TOKEN` / `PIXIV_ACCOUNT_TOKEN_ALTS`：RefreshToken 模式不需要服务端 Pixiv App 凭据。

## App 配置

- `PXVEAPI_BASE=https://<你的域名>`
- 开启 `useApiProxy` 时，App API 代理填写 `<你的域名>`（不带 `https://`）
- `VUE_APP_COMMON_PROXY=https://<你的域名>/proxy/`

## 重要：Vercel 对双斜杠路径的限制

Vercel 会把路径中连续的 `//` 归一化为 `/`，并返回 **308**，例如：

```text
GET /https://www.pixiv.net/stories/...  ->  308 Location: /https:/www.pixiv.net/stories/...
```

该 308 响应由 Vercel 平台生成，**不包含 CORS 头**，因此浏览器跨域请求根路径 URL 代理时会在重定向处失败。服务端本身没有可配置项关闭这一行为。

本 API 已支持单斜杠形式 `/https:/...`，因此可选方案是：

1. **Web 端使用本工作区的 pixiv-viewer-app 时**，增加一个根代理 URL helper 并替换 `src/api/index.js` 里的根路径代理调用：

   ```js
   const pxveRootUrl = target => {
     const raw = String(target)
     const normalized = /^https?:\/\//i.test(raw)
       ? raw.replace(/^(https?):\/\//i, '$1:/')
       : raw.replace(/^\/+/, '')
     return `${PIXIV_NEXT_URL}/${normalized}`
   }
   ```

   涉及 `PIXIV_NEXT_URL + '/' + el.src`、`link.href`、`e.href`，以及 `${PIXIV_NEXT_URL}/https://www.pixiv.net/...`、`${PIXIV_NEXT_URL}/https://www.pixivision.net/...` 等调用。
2. 或把 API 放在能够保留/重写双斜杠的反向代理之后。
3. 或在同源部署 App 与 API，避免跨域（仍会经历 308，但同源不需要 CORS）。

> 按当前需求，本项目只提供 API 与文档，未修改 `pixiv-viewer-app`。

`/proxy/*` 的 GET 请求同样会经历 308；如果 App 在 Web 端用 `fetch`/`axios` 访问它，也需要注意该限制。图片等由浏览器直接加载且不启用 CORS 的场景通常不受影响。

## 部署到 Vercel

```bash
vercel deploy
```

当前环境的 `api.vercel.com` 不可用，因此本次未执行真实部署。部署后在 Vercel 项目环境变量中配置上述变量即可。

## 安全说明

- 根路径代理只允许固定主机白名单，并复用 SSRF 防护。
- 注入 `PIXIV_COOKIE` 的响应强制 `Cache-Control: no-store`。
- 不记录请求体、`Authorization`、`refresh_token` 或 `PHPSESSID`。
- 正式环境保持 `PROXY_BLOCK_PRIVATE=1`、`PROXY_DNS_CHECK=1`。
- `PIXIV_COOKIE` 是共享账号凭据，建议使用专用账号。

## 来源

核心逻辑移植自 [`asadahimeka/pxve-api`](https://github.com/asadahimeka/pxve-api)（MIT License），并针对 Vercel 的路径、函数和缓存模型做了精简与适配。
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { toPublicError } from './lib/sanitize.ts'
import { blocker, isAllowedOrigin } from './middlewares/blocker.ts'
import { logger } from './middlewares/logger.ts'
import { optionalAuth } from './middlewares/optional-auth.ts'
import { routes } from './routes/index.ts'
import { rootProxyHandler } from './routes/root-proxy.ts'

const app = new Hono()

app.use(logger())
app.use(
  cors({
    origin: origin => (origin && isAllowedOrigin(origin) ? origin : undefined),
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-Auth',
      'X-Csrf-Token',
      'X-Client-Time',
      'X-Client-Hash',
      'X-Api-Token',
      'Cache-Control',
    ],
    exposeHeaders: ['X-Response-Time'],
    credentials: true,
    maxAge: 3600,
  })
)
app.use(optionalAuth())
app.use(secureHeaders({ crossOriginResourcePolicy: 'cross-origin' }))
app.use(blocker())

app.route('/', routes)
app.all('*', rootProxyHandler)

app.notFound(c => c.json({ error: 'Not Found' }, 404))
app.onError((err, c) => c.json(toPublicError(err), 500))

export { app }
export default app
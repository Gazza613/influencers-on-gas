import { rateLimit, clientIp } from '../lib/rateLimit.js'

export const config = { runtime: 'edge' }

// Only forward requests to known Higgsfield MCP paths
const ALLOWED_PATH_PREFIXES = [
  '/oauth2/',
  '/mcp',
  '/v1/',
]

function isAllowedPath(path) {
  return ALLOWED_PATH_PREFIXES.some(p => path.startsWith(p))
}

export default async function handler(req) {
  const url = new URL(req.url)

  // /api/hf/* is routed here by a vercel.json rewrite that captures the sub-path into
  // __hfpath, because plain (non-Next) Vercel functions don't support multi-segment
  // catch-alls — only the injected param is reliable after a rewrite.
  let path = '/' + (url.searchParams.get('__hfpath') || '').replace(/^\/+/, '')
  url.searchParams.delete('__hfpath')
  const qs = url.searchParams.toString()
  const search = qs ? `?${qs}` : ''

  if (!isAllowedPath(path)) {
    return new Response('Not found', { status: 404 })
  }

  const target = `https://mcp.higgsfield.ai${path}${search}`

  // CORS preflight
  const origin = req.headers.get('origin') || '*'
  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, accept, mcp-session-id',
    'Access-Control-Allow-Credentials': 'true',
  }
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const rl = rateLimit(clientIp(req.headers))
  if (!rl.ok) {
    return new Response('Too many requests — slow down a moment and try again.', {
      status: 429,
      headers: { ...corsHeaders, 'Retry-After': String(rl.retryAfter) },
    })
  }

  // Forward all request headers, drop 'host' so upstream doesn't reject it
  const forward = new Headers()
  for (const [k, v] of req.headers.entries()) {
    if (k === 'host') continue
    forward.set(k, v)
  }

  const upstream = await fetch(target, {
    method: req.method,
    headers: forward,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
  })

  // Copy response headers, strip ones that cause browser/edge issues
  const respHeaders = new Headers(corsHeaders)
  for (const [k, v] of upstream.headers.entries()) {
    if (['content-encoding', 'transfer-encoding', 'connection'].includes(k)) continue
    respHeaders.set(k, v)
  }

  // Stream the body back (critical for SSE responses during video/image generation)
  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  })
}

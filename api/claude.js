import { rateLimit, clientIp } from '../lib/rateLimit.js'
import { getSession } from '../lib/auth.js'
import { recordUsage } from '../lib/usage.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-app-key, anthropic-version, anthropic-beta')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).send('Method not allowed')
  const session = await getSession(req)
  if (!session) return res.status(401).json({ error: { message: 'Unauthorized — please sign in' } })

  const rl = rateLimit(clientIp(req.headers))
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfter))
    return res.status(429).json({ error: { message: 'Too many requests — slow down a moment and try again.' } })
  }

  // Agency mode: the API key is held centrally as a Vercel env var so the team
  // never needs to supply one. Falls back to a browser-supplied header if the
  // env var isn't set (legacy per-user behavior).
  const apiKey = process.env.ANTHROPIC_API_KEY || req.headers['x-api-key']
  if (!apiKey) return res.status(400).json({ error: { message: 'Server is missing ANTHROPIC_API_KEY' } })

  try {
    const upstreamHeaders = {
      'x-api-key': apiKey,
      'anthropic-version': req.headers['anthropic-version'] || '2023-06-01',
      'content-type': 'application/json',
    }
    if (req.headers['anthropic-beta']) upstreamHeaders['anthropic-beta'] = req.headers['anthropic-beta']

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(req.body),
    })
    const data = await upstream.json()
    // Track Claude usage for this user (calls + tokens).
    if (upstream.ok && data?.usage) {
      const tokens = (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0)
      recordUsage(session.email, 'claude:calls', 1)
      if (tokens) recordUsage(session.email, 'claude:tokens', tokens)
    }
    return res.status(upstream.status).json(data)
  } catch (e) {
    return res.status(500).json({ error: { message: e.message } })
  }
}

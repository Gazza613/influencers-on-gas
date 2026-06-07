import { rateLimit, clientIp } from '../lib/rateLimit.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const rl = rateLimit(clientIp(req.headers))
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfter))
    return res.status(429).json({ error: 'Too many requests — slow down a moment and try again.', items: [] })
  }

  const q = req.query?.q || (req.url && new URLSearchParams(req.url.split('?')[1] || '').get('q'))
  if (!q) return res.status(400).json({ error: 'Missing q' })

  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    })
    const xml = await r.text()

    const items = []
    for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const block = match[1]
      const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]>/)?.[1] || block.match(/<title>(.*?)<\/title>/)?.[1] || '').trim()
      const desc = (block.match(/<description><!\[CDATA\[(.*?)\]\]>/)?.[1] || block.match(/<description>(.*?)<\/description>/)?.[1] || '')
        .replace(/<[^>]+>/g, '').trim().slice(0, 300)
      const date = (block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '').trim()
      if (title) items.push({ title, description: desc, date })
      if (items.length >= 8) break
    }

    return res.status(200).json({ items })
  } catch (e) {
    return res.status(500).json({ error: e.message, items: [] })
  }
}

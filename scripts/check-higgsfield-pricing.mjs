#!/usr/bin/env node
// Weekly Higgsfield pricing watcher (cloud — runs in GitHub Actions).
//
// Fetches the official pricing page, builds a noise-filtered "pricing
// fingerprint" (only price-bearing lines that mention a model/plan + a number),
// and compares it to the committed snapshot. On a real change it writes an issue
// body and signals the workflow to open a GitHub issue.
//
// It deliberately does NOT edit lib/usage.js. Parsing exact per-model credit
// numbers from marketing copy isn't reliable enough to auto-apply — so a human
// (Gary + Claude) re-derives the credit table when this alerts. The point is to
// never MISS a pricing change, not to silently rewrite billing math.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const URLS = ['https://higgsfield.ai/pricing']
const SNAPSHOT = '.github/pricing-snapshot/higgsfield.txt'
const BODY_FILE = 'pricing-change-body.md'

// A line is kept only if it mentions one of these AND contains a digit.
const KEYWORDS = [
  'seedance', 'kling', 'veo', 'nano banana', 'nano-banana', 'nanobanana',
  'gpt image', 'gpt-image', 'seedream', 'credit', 'ultra', 'plus', 'basic',
  'per month', '/mo', '/month', 'annual',
]

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

async function fetchText(url) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' } })
    if (!res.ok) { console.log(`fetch ${url} -> HTTP ${res.status}`); return '' }
    return await res.text()
  } catch (e) { console.log(`fetch ${url} failed: ${e.message}`); return '' }
}

// Next.js SSR/SSG embeds real page data here even when the rest is JS-rendered.
function extractNextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) return ''
  try { return JSON.stringify(JSON.parse(m[1])) } catch { return m[1] }
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
}

function fingerprint(raw) {
  const text = raw.replace(/\s+/g, ' ')
  const segments = text.split(/(?<=[.;:])\s|·|\||,|\}|\{|"/)
  const keep = new Set()
  for (const seg of segments) {
    const s = seg.trim().toLowerCase().replace(/\s+/g, ' ')
    if (s.length < 4 || s.length > 160) continue
    if (!/\d/.test(s)) continue
    if (!KEYWORDS.some(k => s.includes(k))) continue
    keep.add(s)
  }
  return [...keep].sort()
}

async function saveSnapshot(content) {
  await mkdir(dirname(SNAPSHOT), { recursive: true })
  await writeFile(SNAPSHOT, content, 'utf8')
}

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    return writeFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, { flag: 'a' }).catch(() => {})
  }
  console.log(`[output] ${name}=${value}`)
}

async function main() {
  let combined = ''
  for (const url of URLS) {
    const html = await fetchText(url)
    if (html) combined += ' ' + extractNextData(html) + ' ' + stripTags(html)
  }

  const lines = fingerprint(combined)
  if (lines.length === 0) {
    console.log('No pricing content extracted (page JS-only or blocked). Skipping without alarm.')
    return setOutput('changed', 'false')
  }
  const current = lines.join('\n') + '\n'

  let prev = null
  try { prev = await readFile(SNAPSHOT, 'utf8') } catch {}

  if (prev == null) {
    await saveSnapshot(current)
    console.log(`Baseline snapshot created (${lines.length} pricing lines). No alert on first run.`)
    return setOutput('changed', 'false')
  }

  const prevLines = prev.trim().split('\n').filter(Boolean)
  // Guard against a transient under-fetch looking like a mass "removal".
  if (lines.length < prevLines.length * 0.5) {
    console.log(`Extracted only ${lines.length} lines vs ${prevLines.length} in snapshot — likely a transient fetch issue. Skipping without alarm.`)
    return setOutput('changed', 'false')
  }

  if (prev.trim() === current.trim()) {
    console.log(`No change (${lines.length} pricing lines match snapshot).`)
    return setOutput('changed', 'false')
  }

  const prevSet = new Set(prevLines)
  const curSet = new Set(lines)
  const added = lines.filter(l => !prevSet.has(l))
  const removed = prevLines.filter(l => !curSet.has(l))

  const body = [
    '## Higgsfield pricing page changed',
    '',
    `The weekly watcher detected a change in pricing-relevant text on ${URLS.join(', ')}.`,
    '',
    '> This flags **that the page changed** — it does not auto-edit the credit table.',
    '> Ask Claude: _"re-check Higgsfield pricing and amend `lib/usage.js`"_ to confirm the real',
    '> per-model numbers and update the cost estimates.',
    '',
    removed.length ? '### Removed / previous lines\n```\n' + removed.slice(0, 60).join('\n') + '\n```' : '',
    added.length ? '### Added / new lines\n```\n' + added.slice(0, 60).join('\n') + '\n```' : '',
  ].filter(Boolean).join('\n')

  await saveSnapshot(current)
  await writeFile(BODY_FILE, body, 'utf8')
  console.log(`CHANGE DETECTED: +${added.length} / -${removed.length} lines. Snapshot updated; issue will be opened.`)
  await setOutput('changed', 'true')
}

main().catch(e => { console.error('pricing check failed:', e); process.exit(0) })

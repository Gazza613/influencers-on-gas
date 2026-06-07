import { useState, useEffect, createContext, useContext } from 'react'

// Generic small-value localStorage hook (inspiration boards, brand deals, etc.)
function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored ? JSON.parse(stored) : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (e) {
      console.warn('localStorage quota exceeded — data not saved', e)
    }
  }, [key, value])

  return [value, setValue]
}

// ── Per-influencer storage ────────────────────────────────────────
// Each influencer lives in its own key: hf_influencer_${id}
// The ordered list of IDs lives in influencer_ids.
// This way adding/updating influencer N never risks losing influencer M.

const INF_PREFIX = 'hf_influencer_'
const IDS_KEY    = 'influencer_ids'

function readInfluencer(id) {
  try { return JSON.parse(localStorage.getItem(`${INF_PREFIX}${id}`)) } catch { return null }
}

function writeInfluencer(inf) {
  try {
    localStorage.setItem(`${INF_PREFIX}${inf.id}`, JSON.stringify(inf))
    return true
  } catch (e) {
    console.warn(`localStorage quota exceeded — influencer "${inf.name}" not saved`, e)
    return false
  }
}

function readIds() {
  try { return JSON.parse(localStorage.getItem(IDS_KEY) || 'null') } catch { return null }
}

function writeIds(ids) {
  try { localStorage.setItem(IDS_KEY, JSON.stringify(ids)) } catch {}
}

// Read the legacy single-key list (may still have data even after migration attempt)
function readLegacyList() {
  try {
    const raw = localStorage.getItem('influencers')
    if (!raw) return []
    return JSON.parse(raw) || []
  } catch { return [] }
}

function useInfluencerStore(initial) {
  const [influencers, setInfluencers] = useState(() => {
    const ids = readIds()
    if (ids && ids.length > 0) {
      const loaded = ids.map(readInfluencer).filter(Boolean)

      // If we loaded fewer than expected, some hf_influencer_* writes failed (quota).
      // Recover missing ones from the legacy 'influencers' key which may still have the data.
      if (loaded.length < ids.length) {
        const loadedSet = new Set(loaded.map(i => i.id))
        const legacy = readLegacyList()
        for (const inf of legacy) {
          if (!loadedSet.has(inf.id)) {
            loaded.push(inf)
            loadedSet.add(inf.id)
          }
        }
        // Restore original order
        const byId = Object.fromEntries(loaded.map(i => [i.id, i]))
        const ordered = ids.map(id => byId[id]).filter(Boolean)
        // Also pick up any influencers in legacy but not in ids (edge case)
        const orderedSet = new Set(ordered.map(i => i.id))
        for (const inf of legacy) {
          if (!orderedSet.has(inf.id)) ordered.push(inf)
        }
        return ordered.length > 0 ? ordered : initial
      }

      return loaded.length > 0 ? loaded : initial
    }

    // No new-format IDs yet — fall back to legacy single key
    const legacy = readLegacyList()
    return legacy.length > 0 ? legacy : initial
  })

  useEffect(() => {
    const ids = influencers.map(i => i.id)
    writeIds(ids)
    for (const inf of influencers) writeInfluencer(inf)
    // Remove keys for deleted influencers
    const idSet = new Set(ids)
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(INF_PREFIX)) {
        const id = key.slice(INF_PREFIX.length)
        if (!idSet.has(id)) try { localStorage.removeItem(key) } catch {}
      }
    }
  }, [influencers])

  return [influencers, setInfluencers]
}

// ── Shared contexts — one source of truth across all pages ──
const InfluencersCtx = createContext(null)
const InspirationCtx = createContext(null)
const BrandDealsCtx  = createContext(null)

const KAYLA_SEED = {
  id: 'kayla-template',
  name: 'Kayla',
  gender: 'Female',
  type: 'Influencer',
  createdAt: 1715000000000,
  mainImage: '/kayla/main.jpg',
  characterSheetImage: '/kayla/sheet.jpg',
  closeUpImage1: '/kayla/closeup1.jpg',
  closeUpImage2: '/kayla/closeup2.jpg',
  prompt: '',
  age: '18',
  backstory: 'wanna be influencer',
  introExtrovert: 85,
  niche: 'Fashion',
  nicheCustom: '',
  audience: '',
  hobbies: '',
  clothingStyle: 'Streetwear',
  dreamBrands: '',
  voice: '',
  contentPillars: [],
  palette: ['#F472B6', '#FBCFE8', '#C084FC', '#DB2777'],
  videoUrls: [],
  scripts: [],
  homeImages: [],
  brandDealImages: [],
  wardrobeSlots: [],
  physicalDesc: 'white, long wavy blonde hair, blue eyes, medium skin tone, athletic build',
  generationHistory: [
    { id: 'kayla-video-1', type: 'video', label: 'Video', url: 'https://d8j0ntlcm91z4.cloudfront.net/user_2z5tOA1YxOBG2p6w9RhgcS5yRLO/hf_20260518_041646_b7fade5c-6e6b-460a-80c8-3d672acac275.mp4', date: 1779077806000 },
  ],
}

const MARCUS_SEED = {
  id: 'marcus-template',
  name: 'Marcus',
  gender: 'Male',
  type: 'Influencer',
  createdAt: 1715000002000,
  mainImage: '/marcus/main.png',
  characterSheetImage: '/marcus/sheet.png',
  closeUpImage1: '/marcus/closeup1.png',
  closeUpImage2: '/marcus/closeup2.png',
  prompt: '',
  age: '22',
  backstory: 'loves tech since he was young',
  introExtrovert: 60,
  niche: 'Tech',
  nicheCustom: '',
  audience: '',
  hobbies: '',
  clothingStyle: 'Streetwear',
  dreamBrands: '',
  voice: '',
  contentPillars: [],
  palette: ['#6366F1', '#A5B4FC', '#4F46E5', '#1E1B4B'],
  videoUrls: [],
  scripts: [],
  homeImages: [],
  brandDealImages: [],
  wardrobeSlots: [],
  physicalDesc: 'Latino, short black hair, brown eyes, olive skin tone, average build',
  generationHistory: [
    { id: 'marcus-video-1', type: 'video', label: 'Video', url: '/marcus/video1.mp4', date: 1748248415000 },
  ],
}

const CAMILA_SEED = {
  id: 'camila-template',
  name: 'Camila',
  gender: 'Female',
  type: 'Influencer',
  createdAt: 1715000001000,
  mainImage: '/camila/main.jpg',
  characterSheetImage: '/camila/sheet.jpg',
  closeUpImage1: '/camila/closeup1.png',
  closeUpImage2: '/camila/closeup2.png',
  prompt: 'Candid iPhone photo of @image1, wearing the complete outfit from @image2, reproducing all clothing, headwear, and accessories exactly. Match skin texture and facial detail from @image3 and @image4. Mid-action — mid-laugh, mid-sip, mid-step, or mid-reach — body fully committed to the action, expression caught at the apex. Eyes can be on lens (late-arrival) or completely off-axis. Hands engaged with the action, not posed. Expression: direct and serious — neutral mouth at rest, steady gaze into the lens, no smile. Composed and self-assured. Eyes directed off-axis — looking to the side or slightly above the camera, as if unaware of being photographed. A small front window table, street traffic soft and blurred outside the glass, a half-drunk flat white on the table beside her. Soft morning window light from one side, cool and directional. Eye-level, 24mm, handheld. 9:16, chest-up framing. Deep focus, no bokeh, photorealistic. No other people in frame.',
  age: '22',
  backstory: "Camilla got into fitness relatively young, but after realizing she wasn't passionate in personal training clients in the gym, she switched careers to teaching yoga classes.",
  introExtrovert: 70,
  niche: 'Fashion',
  nicheCustom: '',
  audience: '',
  hobbies: '',
  clothingStyle: 'Streetwear',
  dreamBrands: '',
  voice: '',
  contentPillars: [],
  palette: ['#D97706', '#FDE68A', '#B45309', '#92400E'],
  videoUrls: [],
  scripts: [],
  homeImages: [],
  brandDealImages: [],
  wardrobeSlots: [
    { id: 'camila-wardrobe-sporty', name: 'sporty fit', image: '/camila/wardrobe/sporty_fit.png' },
    { id: 'camila-wardrobe-yoga',   name: 'yoga fit',   image: '/camila/wardrobe/yoga_fit.png'   },
  ],
  brandDeals: [
    { id: 'camila-deal-swatch', brand: 'swatch', category: 'fashion', image: '/camila/brand_deals/swatch_original.png', images: ['/camila/brand_deals/swatch_original.png'], characterSheet: '/camila/brand_deals/swatch_sheet.png' },
  ],
  physicalDesc: 'Latina, medium-length wavy brunette hair with side-swept bangs, brown eyes, olive skin tone, slim athletic build',
  generationHistory: [
    { id: 'camila-video-1', type: 'video', label: 'Video', url: '/camila/videos/v1.mp4', date: 1748177579000 },
    { id: 'camila-video-2', type: 'video', label: 'Video', url: '/camila/videos/v2.mp4', date: 1748213180000 },
    { id: 'camila-video-3', type: 'video', label: 'Video', url: '/camila/videos/v3.mp4', date: 1748216854000 },
    { id: 'camila-video-4', type: 'video', label: 'Video', url: '/camila/videos/v4.mp4', date: 1748208318000 },
  ],
}

// ── Sync startup block ────────────────────────────────────────────
// Runs before React renders. Order matters:
// 1. Free quota first (strip bloated video history blobs)
// 2. Then migrate influencers to per-key format while quota is available

// Step 1: Free quota by stripping base64 product refs from video history
try {
  const histKeys = Object.keys(localStorage).filter(k => k.startsWith('hf_video_history_'))
  for (const key of histKeys) {
    const raw = JSON.parse(localStorage.getItem(key) || '[]')
    if (raw.some(e => e.productRef1 || e.productRef2 || e.productRef3)) {
      const cleaned = raw.map(e => { const c = { ...e }; delete c.productRef1; delete c.productRef2; delete c.productRef3; return c })
      try { localStorage.setItem(key, JSON.stringify(cleaned)) } catch { localStorage.removeItem(key) }
    }
  }
} catch (_) {}

// Step 2: Migrate to per-influencer keys (now that quota has been freed)
try {
  const ids = readIds()
  if (!ids) {
    // First run with new code — migrate from legacy 'influencers' key
    const list = readLegacyList()
    if (!list.some(i => i.id === 'kayla-template'))  list.unshift(KAYLA_SEED)
    if (!list.some(i => i.id === 'camila-template')) {
      const ki = list.findIndex(i => i.id === 'kayla-template')
      list.splice(ki + 1, 0, CAMILA_SEED)
    }
    if (!list.some(i => i.id === 'marcus-template')) list.push(MARCUS_SEED)
    for (const inf of list) writeInfluencer(inf)
    writeIds(list.map(i => i.id))
  } else {
    // New format exists — ensure seeds are present
    if (!ids.includes('kayla-template')) {
      writeInfluencer(KAYLA_SEED)
      writeIds(['kayla-template', ...ids])
    } else {
      // Patch seed videos into existing Kayla entry
      const existing = readInfluencer('kayla-template')
      if (existing) {
        const existingVideoIds = new Set((existing.generationHistory || []).filter(e => e.type === 'video').map(e => e.id))
        const missingVideos = (KAYLA_SEED.generationHistory || []).filter(e => e.type === 'video' && !existingVideoIds.has(e.id))
        if (missingVideos.length) {
          writeInfluencer({ ...existing, generationHistory: [...missingVideos, ...(existing.generationHistory || [])] })
        }
      }
    }
    if (!ids.includes('camila-template')) {
      const updated = readIds() || ids
      const ki = updated.indexOf('kayla-template')
      updated.splice(ki + 1, 0, 'camila-template')
      writeInfluencer(CAMILA_SEED)
      writeIds(updated)
    } else {
      // Patch any seed fields that are missing from the existing entry
      const existing = readInfluencer('camila-template')
      if (existing) {
        const existingWardrobeIds = new Set((existing.wardrobeSlots || []).map(s => s.id))
        const missingWardrobe = CAMILA_SEED.wardrobeSlots.filter(s => !existingWardrobeIds.has(s.id))
        const existingDealIds = new Set((existing.brandDeals || []).map(d => d.id))
        const missingDeals = CAMILA_SEED.brandDeals.filter(d => !existingDealIds.has(d.id))
        const existingVideoIds = new Set((existing.generationHistory || []).filter(e => e.type === 'video').map(e => e.id))
        const missingVideos = CAMILA_SEED.generationHistory.filter(e => e.type === 'video' && !existingVideoIds.has(e.id))
        const needsPatch = !existing.closeUpImage1 || !existing.closeUpImage2 || missingWardrobe.length || missingDeals.length || missingVideos.length
        if (needsPatch) {
          writeInfluencer({
            ...existing,
            closeUpImage1: existing.closeUpImage1 || CAMILA_SEED.closeUpImage1,
            closeUpImage2: existing.closeUpImage2 || CAMILA_SEED.closeUpImage2,
            wardrobeSlots: [...(existing.wardrobeSlots || []), ...missingWardrobe],
            brandDeals: [...(existing.brandDeals || []), ...missingDeals],
            generationHistory: [...missingVideos, ...(existing.generationHistory || [])],
          })
        }
      }
    }
    if (!ids.includes('marcus-template')) {
      writeInfluencer(MARCUS_SEED)
      writeIds([...(readIds() || ids), 'marcus-template'])
    } else {
      // Marcus exists but may be missing data from the failed migration — patch it back in
      const existing = readInfluencer('marcus-template')
      if (!existing) {
        writeInfluencer(MARCUS_SEED)
      } else {
        // Patch back seed images/video if they were lost in the failed migration
        const needsPatch =
          !existing.mainImage || existing.mainImage.startsWith('data:') ||
          !existing.characterSheetImage || existing.characterSheetImage.startsWith('data:') ||
          !(existing.generationHistory || []).some(e => e.type === 'video')
        if (needsPatch) {
          const existingVideoHistory = (existing.generationHistory || []).filter(e => e.type === 'video')
          const seedVideo = MARCUS_SEED.generationHistory.filter(e => e.type === 'video')
          const mergedHistory = existingVideoHistory.length ? existing.generationHistory : [...seedVideo, ...(existing.generationHistory || [])]
          writeInfluencer({
            ...existing,
            mainImage: MARCUS_SEED.mainImage,
            characterSheetImage: MARCUS_SEED.characterSheetImage,
            closeUpImage1: MARCUS_SEED.closeUpImage1,
            closeUpImage2: MARCUS_SEED.closeUpImage2,
            generationHistory: mergedHistory,
          })
        }
      }
    }
  }
} catch (_) {}

// Step 3a: Restore missing photos for user-created influencers — ADDITIVE ONLY, never removes
try {
  const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_2z5tOA1YxOBG2p6w9RhgcS5yRLO'
  const RESTORE = [
    // Derek — all 4 photos
    { name: 'Derek', url: `${CDN}/hf_20260526_102441_f96f7c7b-4cc1-4e0f-bd75-3088038c69f8.png`, createdAt: 1748261081000 },
    { name: 'Derek', url: `${CDN}/hf_20260526_102443_3a420032-8203-4f6c-8c7f-6d1171adc2db.png`, createdAt: 1748261083000 },
    { name: 'Derek', url: `${CDN}/hf_20260526_101736_ca48db77-53e6-4335-8a6e-e12d616ea8e7.png`, createdAt: 1748257056000 },
    { name: 'Derek', url: `${CDN}/hf_20260526_101732_8a3965d0-53ed-4c6a-9a5f-11888817a5ae.png`, createdAt: 1748257052000 },
    // Joshua — 2 photos
    { name: 'Joshua', url: `${CDN}/hf_20260526_101651_39cb19bb-94df-4f47-b5cf-c71d4ac6e478.png`, createdAt: 1748256611000 },
    { name: 'Joshua', url: `${CDN}/hf_20260526_101653_cff2e1b2-5dd8-4a79-bafa-7d727c0bca4d.png`, createdAt: 1748256613000 },
    // Jake — 5 photos
    { name: 'Jake', url: `${CDN}/hf_20260526_104559_392be9b8-96f3-4c5a-b0d6-2050d45d9deb.png`, createdAt: 1748263559000 },
    { name: 'Jake', url: `${CDN}/hf_20260526_102734_6ad497c6-bbc4-4c97-970c-6fb5173409da.png`, createdAt: 1748261254000 },
    { name: 'Jake', url: `${CDN}/hf_20260526_102733_4b1aeb26-ba4e-4e1b-a76d-357d9cbe26a4.png`, createdAt: 1748261253000 },
    { name: 'Jake', url: `${CDN}/hf_20260526_102234_76e09a86-e6a2-423d-9d41-f45724eda8fa.png`, createdAt: 1748261154000 },
    { name: 'Jake', url: `${CDN}/hf_20260526_102231_0daa99dd-e291-47f6-b78d-eb816d171ac8.png`, createdAt: 1748261151000 },
  ]
  const ids = readIds() || []
  const nameToId = {}
  for (const id of ids) {
    try { const inf = readInfluencer(id); if (inf?.name) nameToId[inf.name] = id } catch {}
  }
  const existing = JSON.parse(localStorage.getItem('photo_studio_history') || '[]')
  const existingUrls = new Set(existing.map(e => e.url))
  const toAdd = RESTORE
    .filter(r => nameToId[r.name] && !existingUrls.has(r.url))
    .map(r => ({ influencerId: nameToId[r.name], url: r.url, createdAt: r.createdAt, location: '', timeOfDay: '', aspectRatio: '9:16', settings: null }))
  if (toAdd.length) {
    // Merge by inserting at correct chronological position — never overwrites existing entries
    const merged = [...existing, ...toAdd].sort((a, b) => b.createdAt - a.createdAt)
    try { localStorage.setItem('photo_studio_history', JSON.stringify(merged)) } catch {}
  }
} catch (_) {}

// Step 3b: Restore missing videos for user-created influencers — patches into generationHistory, ADDITIVE ONLY
try {
  const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_2z5tOA1YxOBG2p6w9RhgcS5yRLO'
  const RESTORE_VIDEOS = [
    // Brad
    { name: 'Brad', id: 'brad-video-restore-1', url: `${CDN}/hf_20260526_110221_3922b091-289c-4ad4-8d40-a57b7e82f9cc.mp4`, date: 1748261341000 },
    // Derek
    { name: 'Derek', id: 'derek-video-restore-1', url: `${CDN}/hf_20260526_113121_248608f1-9f0f-4759-b338-3173ce804261.mp4`, date: 1748259081000 },
  ]
  const ids = readIds() || []
  const nameToId = {}
  for (const id of ids) {
    try { const inf = readInfluencer(id); if (inf?.name) nameToId[inf.name] = id } catch {}
  }
  for (const entry of RESTORE_VIDEOS) {
    const infId = nameToId[entry.name]
    if (!infId) continue
    const inf = readInfluencer(infId)
    if (!inf) continue
    const existingIds = new Set((inf.generationHistory || []).map(e => e.id))
    if (!existingIds.has(entry.id)) {
      const newEntry = { id: entry.id, type: 'video', label: 'Video', url: entry.url, date: entry.date }
      writeInfluencer({ ...inf, generationHistory: [newEntry, ...(inf.generationHistory || [])] })
    }
  }
} catch (_) {}

// Step 3: Inject Camila's 11 photos into photo_studio_history (where the Photos tab actually reads from)
try {
  const CAMILA_PHOTO_URLS = [
    '/camila/photos/p1.png', '/camila/photos/p2.png', '/camila/photos/p3.png',
    '/camila/photos/p4.png', '/camila/photos/p5.png', '/camila/photos/p6.png',
    '/camila/photos/p7.png', '/camila/photos/p8.png', '/camila/photos/p9.png',
    '/camila/photos/p10.png', '/camila/photos/p11.png',
    '/camila/photos/p12.png', '/camila/photos/p13.png',
  ]
  const existing = JSON.parse(localStorage.getItem('photo_studio_history') || '[]')
  const existingUrls = new Set(existing.map(e => e.url))
  const toAdd = CAMILA_PHOTO_URLS.filter(url => !existingUrls.has(url)).map(url => ({
    influencerId: 'camila-template',
    url,
    createdAt: 1748131200000,
    location: '',
    timeOfDay: '',
    aspectRatio: '9:16',
    settings: null,
  }))
  if (toAdd.length) {
    try { localStorage.setItem('photo_studio_history', JSON.stringify([...existing, ...toAdd])) } catch {}
  }
} catch (_) {}

const TEMPLATE_IDS = new Set(['kayla-template', 'camila-template', 'marcus-template'])

export function StoreProvider({ children }) {
  const influencerStore = useInfluencerStore([KAYLA_SEED, CAMILA_SEED, MARCUS_SEED])
  const inspirationState = useLocalStorage('inspiration_boards', [])
  const brandDealsState  = useLocalStorage('brand_deals', [])
  const [, setInspirationBoards] = inspirationState
  const [, setDealsData]         = brandDealsState

  // Seed from /seeds.json when seed IDs are missing from localStorage
  useEffect(() => {
    fetch('/seeds.json')
      .then(r => r.json())
      .then(seeds => {
        const currentIds = new Set(readIds() || [])
        const missingSeedIds = seeds.influencer_ids.filter(id => !currentIds.has(id))
        let didWrite = false

        if (missingSeedIds.length) {
          // Write only the missing seed influencers, preserve everything already there
          const allIds = [...seeds.influencer_ids]
          // Also keep any user IDs not in seeds (in case user added new ones)
          for (const id of currentIds) {
            if (!allIds.includes(id)) allIds.push(id)
          }
          writeIds(allIds)
          for (const id of missingSeedIds) {
            if (seeds.influencers[id]) writeInfluencer(seeds.influencers[id])
          }

          // Merge photo history — add seed photos that aren't already there
          const existingPhotos = JSON.parse(localStorage.getItem('photo_studio_history') || '[]')
          const existingPhotoUrls = new Set(existingPhotos.map(p => p.url))
          const newPhotos = (seeds.photo_studio_history || []).filter(p => !existingPhotoUrls.has(p.url))
          if (newPhotos.length) {
            const merged = [...existingPhotos, ...newPhotos].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            try { localStorage.setItem('photo_studio_history', JSON.stringify(merged)) } catch {}
          }

          didWrite = true
        }

        // Always patch existing influencers that are missing prompt or backstory from seeds
        for (const [id, seedInf] of Object.entries(seeds.influencers || {})) {
          if (!currentIds.has(id)) continue // will be written above if missing
          const existing = readInfluencer(id)
          if (!existing) continue
          const needsPatch = (seedInf.prompt && !existing.prompt) || (seedInf.backstory && !existing.backstory)
          if (needsPatch) {
            writeInfluencer({
              ...existing,
              prompt: existing.prompt || seedInf.prompt || '',
              backstory: existing.backstory || seedInf.backstory || '',
            })
            didWrite = true
          }
        }

        // Always merge inspiration boards via React state setter — no reload needed
        const existingBoards = JSON.parse(localStorage.getItem('inspiration_boards') || '[]')
        const existingBoardIds = new Set(existingBoards.map(b => b.id))
        const newBoards = (seeds.inspiration_boards || []).filter(b => b.id && !existingBoardIds.has(b.id))
        if (newBoards.length) {
          setInspirationBoards(prev => {
            const prevIds = new Set(prev.map(b => b.id))
            const toAdd = newBoards.filter(b => !prevIds.has(b.id))
            return toAdd.length ? [...toAdd, ...prev] : prev
          })
        }

        // Always merge global brand deals via React state setter — no reload needed
        const existingDeals = JSON.parse(localStorage.getItem('brand_deals') || '[]')
        const existingDealMap = new Map(existingDeals.map(d => [d.id, d]))
        const newDeals = (seeds.brand_deals || []).filter(d => d.id && !existingDealMap.has(d.id))
        const patchedDeals = existingDeals.map(d => {
          const seed = (seeds.brand_deals || []).find(s => s.id === d.id)
          if (!seed) return d
          const needsPatch = (seed.image && d.image !== seed.image) || (seed.characterSheet && d.characterSheet !== seed.characterSheet)
          if (needsPatch) return { ...d, image: seed.image || d.image, characterSheet: seed.characterSheet || d.characterSheet }
          return d
        })
        const dealsChanged = newDeals.length || patchedDeals.some((d, i) => d !== existingDeals[i])
        if (dealsChanged) {
          setDealsData([...newDeals, ...patchedDeals])
        }

        // Only reload when influencer data or photo history changed — boards/deals are handled above via state
        if (didWrite) window.location.reload()
      })
      .catch(e => console.warn('[seeds] failed to load:', e))
  }, []) // eslint-disable-line

  return (
    <InfluencersCtx.Provider value={influencerStore}>
      <InspirationCtx.Provider value={inspirationState}>
        <BrandDealsCtx.Provider value={brandDealsState}>
          {children}
        </BrandDealsCtx.Provider>
      </InspirationCtx.Provider>
    </InfluencersCtx.Provider>
  )
}

export function useInfluencers()       { return useContext(InfluencersCtx) }
export function useInspirationBoards() { return useContext(InspirationCtx) }
export function useBrandDeals()        { return useContext(BrandDealsCtx) }

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

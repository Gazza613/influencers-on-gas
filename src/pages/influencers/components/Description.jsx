import { pLabel } from '../../../utils/influencerUtils'
import { audiencePh, getNiches, pColor } from '../helpers'
import { BareInput, ColorPalette, GenderButtons, InfoCell } from './common'

// ─────────────────────────────────────────────
// Overview form
export function DescriptionForm({ influencer, onUpdate }) {
  const u = (k, v) => onUpdate(influencer.id, { [k]: v })
  const niches = getNiches(influencer.gender)
  const aPh = audiencePh(influencer.gender, influencer.niche)
  const pv = influencer.introExtrovert ?? 50

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* ── Identity ── */}
      <div style={{ background: 'var(--bg)', borderRadius: 12, padding: '16px 18px' }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 12 }}>Identity</div>
        <div style={{ marginBottom: 12 }}>
          <GenderButtons value={influencer.gender ?? ''} onChange={v => u('gender', v)}/>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 5 }}>Age</div>
            <input value={influencer.age ?? ''} onChange={e => u('age', e.target.value)} placeholder="—"
              style={{ width: '100%', border: 'none', background: 'transparent', padding: 0, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', outline: 'none' }}/>
          </div>
          <div>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 4 }}>Niche</div>
            <select value={niches.includes(influencer.niche) ? influencer.niche : (influencer.niche ? 'Other' : '')} onChange={e => u('niche', e.target.value)}
              style={{ width: '100%', border: 'none', background: 'transparent', padding: 0, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: influencer.niche ? 'var(--text-primary)' : 'var(--text-tertiary)', outline: 'none', appearance: 'none', cursor: 'pointer' }}>
              <option value="" disabled>Select…</option>
              {niches.map(n => <option key={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 4 }}>Location</div>
            <BareInput value={influencer.location ?? ''} onChange={e => u('location', e.target.value)} placeholder="e.g. NYC"/>
          </div>
        </div>
      </div>

      {/* ── Backstory ── */}
      <InfoCell label="Backstory" icon="✦">
        <BareInput
          value={influencer.backstory ?? ''}
          onChange={e => u('backstory', e.target.value)}
          placeholder="Who are they? Where are they from? What drives them?"
          multiline rows={4}
        />
      </InfoCell>

      {/* ── Personality ── */}
      <div style={{ background: 'var(--bg)', borderRadius: 12, padding: '13px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Personality</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: pColor(pv) }}>{pLabel(pv)}</span>
        </div>
        <input type="range" min={0} max={100} value={pv} onChange={e => u('introExtrovert', Number(e.target.value))}
          style={{ width: '100%', height: 5, borderRadius: 3, background: 'linear-gradient(to right,#FBBF24,#F97316,#EF4444)', outline: 'none', appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }}/>
        <style>{`input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#fff;border:2.5px solid ${pColor(pv)};box-shadow:0 1px 4px rgba(0,0,0,.15);cursor:pointer;}`}</style>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Introvert</span>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Extrovert</span>
        </div>
      </div>

      {/* ── Target Audience ── */}
      <InfoCell label="Target Audience" icon="👥">
        <BareInput value={influencer.audience ?? ''} onChange={e => u('audience', e.target.value)} placeholder={aPh}/>
      </InfoCell>

      {/* ── Physical ── */}
      {influencer.physicalDesc && (
        <InfoCell label="Physical Description" icon="✧">
          <BareInput value={influencer.physicalDesc ?? ''} onChange={e => u('physicalDesc', e.target.value)} placeholder="Physical appearance…"/>
        </InfoCell>
      )}

      {/* ── Lifestyle ── */}
      <div className="desc-grid-2">
        <InfoCell label="Hobbies & Interests" icon="🎯">
          <BareInput value={influencer.hobbies ?? ''} onChange={e => u('hobbies', e.target.value)} placeholder="e.g. Yoga, travel, photography…" multiline rows={2}/>
        </InfoCell>
        <InfoCell label="Aesthetic / Style Vibe" icon="✨">
          <BareInput value={influencer.clothingStyle ?? ''} onChange={e => u('clothingStyle', e.target.value)} placeholder="e.g. Minimalist, Old Money…" multiline rows={2}/>
        </InfoCell>
      </div>

      {/* ── Brand ── */}
      <div className="desc-grid-2">
        <InfoCell label="Dream Brands" icon="💎">
          <BareInput value={influencer.dreamBrands ?? ''} onChange={e => u('dreamBrands', e.target.value)} placeholder="e.g. Nike, Glossier, Loewe…"/>
        </InfoCell>
        <InfoCell label="Content Pillars" icon="📌">
          <BareInput value={(influencer.contentPillars ?? []).join(', ')} onChange={e => u('contentPillars', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="e.g. Fitness, Mindset, Style…"/>
        </InfoCell>
      </div>

      {/* ── Color Palette + Voice ── */}
      <div className="desc-grid-2">
        <InfoCell label="Brand Colors" icon="🎨">
          <ColorPalette palette={influencer.palette ?? []} onChange={v => u('palette', v)} gender={influencer.gender}/>
        </InfoCell>
        <InfoCell label="Voice / TTS" icon="🎙">
          <BareInput value={influencer.voice ?? ''} onChange={e => u('voice', e.target.value)} placeholder="e.g. Higgsfield, ElevenLabs…"/>
        </InfoCell>
      </div>

    </div>
  )
}

// ─────────────────────────────────────────────
// Wardrobe generator



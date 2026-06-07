import { createContext, useContext, useState, useEffect } from 'react'
import { flushSync } from 'react-dom'

const ThemeContext = createContext()

// Ink-splash shape: 4 outward spikes with deep concavities between them.
// Deliberately asymmetric so it reads as organic paint, not a circle.
// Returns raw SVG path data (no path() wrapper) so it can be set as the `d` attribute.
function splatD(cx, cy, r) {
  const p = (x, y) => `${Math.round(x)} ${Math.round(y)}`
  return [
    `M ${p(cx + r*0.08,  cy - r*1.35)}`,
    `C ${p(cx + r*0.50,  cy - r*1.20)} ${p(cx + r*0.28,  cy - r*0.42)} ${p(cx + r*0.52,  cy - r*0.32)}`,
    `C ${p(cx + r*0.76,  cy - r*0.22)} ${p(cx + r*1.68,  cy + r*0.02)} ${p(cx + r*1.48,  cy + r*0.38)}`,
    `C ${p(cx + r*1.28,  cy + r*0.74)} ${p(cx + r*0.42,  cy + r*0.48)} ${p(cx + r*0.32,  cy + r*0.72)}`,
    `C ${p(cx + r*0.22,  cy + r*0.96)} ${p(cx + r*0.12,  cy + r*1.58)} ${p(cx - r*0.12,  cy + r*1.38)}`,
    `C ${p(cx - r*0.36,  cy + r*1.18)} ${p(cx - r*0.48,  cy + r*0.52)} ${p(cx - r*0.64,  cy + r*0.46)}`,
    `C ${p(cx - r*0.80,  cy + r*0.40)} ${p(cx - r*1.62,  cy + r*0.12)} ${p(cx - r*1.42,  cy - r*0.22)}`,
    `C ${p(cx - r*1.22,  cy - r*0.56)} ${p(cx - r*0.34,  cy - r*0.68)} ${p(cx - r*0.18,  cy - r*1.02)}`,
    `C ${p(cx - r*0.02,  cy - r*1.36)} ${p(cx + r*0.04,  cy - r*1.38)} ${p(cx + r*0.08,  cy - r*1.35)} Z`,
  ].join(' ')
}

let busy = false

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    if (!localStorage.getItem('theme_default_v2')) {
      localStorage.setItem('theme_default_v2', '1')
      localStorage.setItem('theme', 'dark')
      return 'dark'
    }
    return localStorage.getItem('theme') || 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  function toggle(x, y) {
    if (busy) return
    const next = theme === 'light' ? 'dark' : 'light'
    if (!document.startViewTransition) { setTheme(next); return }

    busy = true

    // Remove any stale elements from an interrupted previous transition
    document.getElementById('theme-splat-svg')?.remove()
    document.getElementById('theme-splat-style')?.remove()

    const cx  = x  ?? window.innerWidth  - 46
    const cy  = y  ?? window.innerHeight - 46
    const endR = Math.hypot(
      Math.max(cx, window.innerWidth  - cx),
      Math.max(cy, window.innerHeight - cy)
    ) * 1.15

    const NS      = 'http://www.w3.org/2000/svg'
    const svgEl   = document.createElementNS(NS, 'svg')
    const defsEl  = document.createElementNS(NS, 'defs')
    const clipEl  = document.createElementNS(NS, 'clipPath')
    const pathEl  = document.createElementNS(NS, 'path')

    svgEl.id = 'theme-splat-svg'
    svgEl.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:99999'
    clipEl.id = 'theme-splat'
    clipEl.setAttribute('clipPathUnits', 'userSpaceOnUse')
    pathEl.setAttribute('d', splatD(cx, cy, 1))
    clipEl.appendChild(pathEl)
    defsEl.appendChild(clipEl)
    svgEl.appendChild(defsEl)
    document.body.appendChild(svgEl)

    const styleEl = document.createElement('style')
    styleEl.id = 'theme-splat-style'
    styleEl.textContent = `
      ::view-transition-old(root),::view-transition-new(root){animation:none;mix-blend-mode:normal}
      ::view-transition-new(root){clip-path:url(#theme-splat)}
    `
    document.head.appendChild(styleEl)

    function cleanup() { svgEl.remove(); styleEl.remove(); busy = false }

    const vt = document.startViewTransition(() => { flushSync(() => setTheme(next)) })

    vt.ready.then(() => {
      document.documentElement.animate(
        { opacity: [1, 0] },
        { duration: 420, easing: 'ease-in', fill: 'forwards', pseudoElement: '::view-transition-old(root)' }
      )

      const anim = pathEl.animate(
        { d: [`path("${splatD(cx, cy, 1)}")`, `path("${splatD(cx, cy, endR)}")`] },
        { duration: 950, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }
      )
      anim.onfinish = cleanup
      anim.oncancel = cleanup
    }).catch(cleanup)

    vt.finished.catch(cleanup)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)

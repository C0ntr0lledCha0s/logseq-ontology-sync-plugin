/**
 * Logseq theme integration. The plugin iframe does not inherit Logseq's CSS, so the host's
 * computed theme tokens are resolved with `logseq.UI.resolveThemeCssPropsVals` and mapped to the
 * builder's own `--rb-*` variables.
 */

export type ThemeVals = Record<string, string | undefined>

const HEADER_PROPS = [
  '--ls-headbar-height',
  '--ls-headbar-inner-top-padding',
  '--ls-win32-title-bar-height',
] as const

/** Matches the host's default head bar height; used when the host does not report one. */
export const DEFAULT_HEADBAR_PX = 48
/** Gap between the host's drag strip and the panel. */
export const PANEL_GAP_PX = 12

export const THEME_PROPS = [
  '--ls-primary-background-color',
  '--ls-secondary-background-color',
  '--ls-tertiary-background-color',
  '--ls-quaternary-background-color',
  '--ls-primary-text-color',
  '--ls-secondary-text-color',
  '--ls-border-color',
  '--ls-link-text-color',
  '--ls-selection-background-color',
  '--ls-menu-hover-color',
  '--ls-font-family',
  '--ls-border-radius-low',
  '--lx-gray-01',
  '--lx-gray-03',
  '--lx-gray-05',
  '--lx-gray-06',
  '--lx-gray-11',
  '--lx-gray-12',
  '--lx-accent-09',
  '--lx-accent-11',
] as const

export const HOST_PROPS: string[] = [...HEADER_PROPS, ...THEME_PROPS]

function px(value: string | undefined): number | null {
  if (value === undefined) return null
  const m = /^\s*(-?\d+(?:\.\d+)?)px\s*$/.exec(value)
  return m ? Number(m[1]) : null
}

/**
 * Top offset for the panel: the host's drag strip (head bar height + inner padding + win32
 * title bar) plus a gap. Missing win32 height or padding count as 0; a missing or unparseable
 * head bar height falls back to 48px.
 */
export function headerOffsetPx(vals: ThemeVals): number {
  const bar = px(vals['--ls-headbar-height']) ?? DEFAULT_HEADBAR_PX
  const padding = px(vals['--ls-headbar-inner-top-padding']) ?? 0
  const win32 = px(vals['--ls-win32-title-bar-height']) ?? 0
  return bar + padding + win32 + PANEL_GAP_PX
}

/** Whether the head bar height was resolved (so the caller can log the fallback once). */
export function hasHeadbarHeight(vals: ThemeVals): boolean {
  return px(vals['--ls-headbar-height']) !== null
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number): number => {
    const k = (n + h / 30) % 12
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))
  }
  return [f(0), f(8), f(4)]
}

/**
 * Relative luminance (0-1) of `#rgb`, `#rrggbb`, `rgb()/rgba()` and `hsl()/hsla()` colours
 * (comma or space separated). Null for anything else; callers then assume a light theme.
 */
function luminance(color: string): number | null {
  const c = color.trim()
  let rgb: [number, number, number]
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c)
  const fn = /^(rgba?|hsla?)\(\s*([^)]*)\)$/i.exec(c)
  if (hex) {
    const h = hex[1]!.length === 3 ? [...hex[1]!].map((x) => x + x).join('') : hex[1]!
    rgb = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  } else if (fn) {
    const nums = fn[2]!
      .split(/[\s,/]+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((x) => parseFloat(x))
    if (nums.length < 3 || nums.some((n) => Number.isNaN(n))) return null
    if (fn[1]!.toLowerCase().startsWith('hsl')) {
      rgb = hslToRgb(((nums[0]! % 360) + 360) % 360, nums[1]! / 100, nums[2]! / 100)
    } else {
      rgb = [nums[0]!, nums[1]!, nums[2]!]
    }
  } else return null
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255
}

function pick(vals: ThemeVals, names: string[], fallback: string): string {
  for (const n of names) {
    const v = vals[n]?.trim()
    if (v) return v
  }
  return fallback
}

/**
 * Maps resolved Logseq tokens to the builder's variables. DB-version `--lx-*` tokens win where
 * they exist, then the classic `--ls-*` ones. Minimal fallback (a readable light theme) is used
 * for any token the host does not define.
 */
export function themeVars(vals: ThemeVals): Record<string, string> {
  const bg = pick(vals, ['--lx-gray-01', '--ls-primary-background-color'], '#ffffff')
  const accent = pick(vals, ['--lx-accent-09', '--ls-link-text-color'], '#2d6cdf')
  const lum = luminance(bg)
  const dark = lum !== null && lum < 0.5
  return {
    '--rb-bg': bg,
    '--rb-panel': pick(vals, ['--lx-gray-03', '--ls-secondary-background-color'], '#f3f3f3'),
    '--rb-hover': pick(
      vals,
      ['--ls-menu-hover-color', '--lx-gray-05', '--ls-tertiary-background-color'],
      '#e6e6e6'
    ),
    '--rb-active': pick(vals, ['--ls-quaternary-background-color', '--lx-gray-05'], '#dcdcdc'),
    '--rb-selection': pick(
      vals,
      ['--ls-selection-background-color'],
      `color-mix(in srgb, ${accent} 25%, transparent)`
    ),
    '--rb-text': pick(vals, ['--lx-gray-12', '--ls-primary-text-color'], '#222222'),
    '--rb-muted': pick(vals, ['--lx-gray-11', '--ls-secondary-text-color'], '#666666'),
    '--rb-border': pick(vals, ['--lx-gray-06', '--ls-border-color'], 'rgba(128,128,128,.35)'),
    '--rb-accent': accent,
    '--rb-accent-text': pick(vals, ['--lx-accent-11', '--ls-link-text-color'], accent),
    '--rb-font': pick(vals, ['--ls-font-family'], 'system-ui, sans-serif'),
    '--rb-radius': pick(vals, ['--ls-border-radius-low'], '4px'),
    '--rb-tag-l': dark ? '62%' : '48%',
    '--rb-tag-a': dark ? '.32' : '.22',
    '--rb-backdrop': dark ? 'rgba(0,0,0,.55)' : 'rgba(0,0,0,.35)',
  }
}

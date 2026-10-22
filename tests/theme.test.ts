import { describe, expect, test } from 'bun:test'
import { headerOffsetPx, themeVars } from '../src/ui/builder/theme'

describe('headerOffsetPx', () => {
  test('sums bar, padding, win32 title bar and a 12px gap', () => {
    expect(
      headerOffsetPx({
        '--ls-headbar-height': '48px',
        '--ls-headbar-inner-top-padding': '4px',
        '--ls-win32-title-bar-height': '32px',
      })
    ).toBe(96)
  })
  test('missing padding and win32 count as 0', () => {
    expect(headerOffsetPx({ '--ls-headbar-height': '40px' })).toBe(52)
  })
  test('missing or unparseable bar height falls back to 48px', () => {
    expect(headerOffsetPx({})).toBe(60)
    expect(headerOffsetPx({ '--ls-headbar-height': 'calc(1px)' })).toBe(60)
  })
  test('parses decimals and ignores unparseable extras', () => {
    expect(
      headerOffsetPx({ '--ls-headbar-height': '48.5px', '--ls-win32-title-bar-height': 'auto' })
    ).toBe(60.5)
  })
})

describe('themeVars', () => {
  const light = {
    '--ls-primary-background-color': '#ffffff',
    '--ls-secondary-background-color': '#f5f5f5',
    '--ls-tertiary-background-color': '#eeeeee',
    '--ls-quaternary-background-color': '#dddddd',
    '--ls-primary-text-color': '#433f38',
    '--ls-secondary-text-color': '#8a8a8a',
    '--ls-border-color': '#ccc',
    '--ls-link-text-color': '#045591',
    '--ls-selection-background-color': '#cde',
    '--ls-menu-hover-color': '#efefef',
    '--ls-font-family': 'Inter',
    '--ls-border-radius-low': '6px',
  }
  test('maps classic tokens', () => {
    const v = themeVars(light)
    expect(v['--rb-bg']).toBe('#ffffff')
    expect(v['--rb-panel']).toBe('#f5f5f5')
    expect(v['--rb-hover']).toBe('#efefef')
    expect(v['--rb-active']).toBe('#dddddd')
    expect(v['--rb-text']).toBe('#433f38')
    expect(v['--rb-muted']).toBe('#8a8a8a')
    expect(v['--rb-border']).toBe('#ccc')
    expect(v['--rb-accent']).toBe('#045591')
    expect(v['--rb-selection']).toBe('#cde')
    expect(v['--rb-font']).toBe('Inter')
    expect(v['--rb-radius']).toBe('6px')
    expect(v['--rb-tag-l']).toBe('48%')
  })
  test('prefers DB-version tokens', () => {
    const v = themeVars({
      ...light,
      '--lx-gray-01': '#fafafa',
      '--lx-gray-12': '#111',
      '--lx-accent-09': '#3e63dd',
    })
    expect(v['--rb-bg']).toBe('#fafafa')
    expect(v['--rb-text']).toBe('#111')
    expect(v['--rb-accent']).toBe('#3e63dd')
  })
  test('detects dark backgrounds', () => {
    const v = themeVars({ '--ls-primary-background-color': 'rgb(0, 43, 54)' })
    expect(v['--rb-tag-l']).toBe('62%')
  })
  test('missing values fall back to a readable light theme', () => {
    const v = themeVars({ '--ls-primary-background-color': '  ' })
    expect(v['--rb-bg']).toBe('#ffffff')
    expect(v['--rb-text']).toBe('#222222')
    expect(v['--rb-accent']).toBe('#2d6cdf')
    expect(v['--rb-font']).toBe('system-ui, sans-serif')
    expect(v['--rb-radius']).toBe('4px')
    for (const value of Object.values(v)) expect(value).not.toBe('')
  })
})

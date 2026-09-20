import { describe, expect, it } from 'vitest'

import {
  normalizeHbmOpenString,
  pathFromHbmDeepLink,
  pathFromOpenDeepLink,
  resolveHbmOpenPath
} from './hbm-open-target'

describe('normalizeHbmOpenString', () => {
  it('accepts hash-router paths and strips a leading hash', () => {
    expect(normalizeHbmOpenString('/index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeHbmOpenString('#/index-network/intent/1')).toBe('/index-network/intent/1')
  })

  it('maps plugin-scoped hbm:// deep links to the same path', () => {
    expect(normalizeHbmOpenString('hbm://index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeHbmOpenString('hbm://index-network/intent/1?focus=true')).toBe(
      '/index-network/intent/1?focus=true'
    )
  })

  it('maps hbm://open/… deep links by stripping the open host', () => {
    expect(normalizeHbmOpenString('hbm://open/index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeHbmOpenString('hbm://open/settings/plugins')).toBe('/settings/plugins')
  })

  it('rejects reserved hbm kinds and unsafe paths', () => {
    expect(normalizeHbmOpenString('hbm://blueprint/morning-brief')).toBeNull()
    expect(normalizeHbmOpenString('hbm://plugin/install')).toBeNull()
    expect(normalizeHbmOpenString('https://example.com/x')).toBeNull()
    expect(normalizeHbmOpenString('/../etc/passwd')).toBeNull()
    expect(normalizeHbmOpenString('index-network')).toBeNull()
  })
})

describe('resolveHbmOpenPath', () => {
  it('merges structured path + params', () => {
    expect(resolveHbmOpenPath({ path: '/index-network/intent/1', params: { focus: 'true' } })).toBe(
      '/index-network/intent/1?focus=true'
    )
  })

  it('resolves href the same as a bare string', () => {
    expect(resolveHbmOpenPath({ href: 'hbm://index-network/intent/1' })).toBe('/index-network/intent/1')
  })
})

describe('pathFromHbmDeepLink', () => {
  it('builds the navigate path from a plugin-scoped deep-link payload', () => {
    expect(pathFromHbmDeepLink('index-network', 'intent/1')).toBe('/index-network/intent/1')
  })

  it('builds the navigate path from hbm://open/… payloads', () => {
    expect(pathFromOpenDeepLink('index-network/intent/1')).toBe('/index-network/intent/1')
    expect(pathFromHbmDeepLink('open', 'agent/42')).toBe('/agent/42')
  })

  it('ignores reserved kinds', () => {
    expect(pathFromHbmDeepLink('blueprint', 'morning-brief')).toBeNull()
    expect(pathFromHbmDeepLink('plugin', 'install')).toBeNull()
  })
})

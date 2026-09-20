import assert from 'node:assert/strict'

import { test } from 'vitest'

import { desktopBackendSpawnEnv, guestOnboardingEnabled, skipIntroEnabled } from './guest-onboarding'
import { buildSpawnCommand } from './remote-lifecycle'

test('skipIntroEnabled: exactly "1" in env or --skip-intro on argv skips the first-run film', () => {
  assert.equal(skipIntroEnabled([], { HBM_SKIP_INTRO: '1' }), true)
  assert.equal(skipIntroEnabled(['electron', '.', '--skip-intro'], {}), true)

  assert.equal(skipIntroEnabled([], {}), false)
  assert.equal(skipIntroEnabled([], { HBM_SKIP_INTRO: 'true' }), false)
})

test('guestOnboardingEnabled: exactly "1" in env or --guest-onboarding on argv turns the free tier on', () => {
  assert.equal(guestOnboardingEnabled([], { HBM_GUEST_ONBOARDING: '1' }), true)
  assert.equal(guestOnboardingEnabled(['electron', '.', '--guest-onboarding'], {}), true)

  assert.equal(guestOnboardingEnabled([], {}), false)
  assert.equal(guestOnboardingEnabled([], { HBM_GUEST_ONBOARDING: 'true' }), false)
  assert.equal(guestOnboardingEnabled([], { HBM_GUEST_ONBOARDING: '0' }), false)
  assert.equal(guestOnboardingEnabled(['electron', '.', '--local'], { HBM_GUEST_ONBOARDING: '' }), false)
})

test('desktopBackendSpawnEnv stamps the launch decision last and never lets an inherited value leak', () => {
  const base = {
    HBM_HOME: '/tmp/home',
    HBM_DESKTOP: '1',
    HBM_GUEST_ONBOARDING: '1',
    PATH: '/usr/bin'
  }

  const on = desktopBackendSpawnEnv({ ...base, HBM_GUEST_ONBOARDING: '0' }, true)
  assert.equal(on.HBM_GUEST_ONBOARDING, '1')

  const off = desktopBackendSpawnEnv(base, false)
  assert.equal(off.HBM_GUEST_ONBOARDING, '0', 'a stray inherited "1" must not turn the free tier on')

  for (const env of [on, off]) {
    assert.equal(env.HBM_HOME, base.HBM_HOME)
    assert.equal(env.HBM_DESKTOP, base.HBM_DESKTOP)
    assert.equal(env.PATH, base.PATH)
  }
})

test('remote SSH spawn command carries HBM_GUEST_ONBOARDING=1 only when the launch decided on', () => {
  const on = buildSpawnCommand('/x/hbm', 'work', { logPath: '~/.hbm/log', guestOnboarding: true })
  assert.match(on, /exec env HBM_DESKTOP=1 HBM_GUEST_ONBOARDING=1 /)

  const off = buildSpawnCommand('/x/hbm', 'work', { logPath: '~/.hbm/log', guestOnboarding: false })
  assert.match(off, /exec env HBM_DESKTOP=1 /)
  assert.doesNotMatch(off, /HBM_GUEST_ONBOARDING/)

  const unset = buildSpawnCommand('/x/hbm', 'work', { logPath: '~/.hbm/log' })
  assert.doesNotMatch(unset, /HBM_GUEST_ONBOARDING/)
})

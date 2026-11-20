/** The chat picker offers a route only once a profile configures it and the key that profile names is stored. */
import { afterEach, expect, it, vi } from 'vitest'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { apiKeyEnvAt, profileAt, routableRoutes, settledSettings } from '../src/client/routable.ts'

const credentials = { TEAM_KEY: { configured: true }, EMPTY_KEY: { configured: false } }

function snapshot(status: 'loading' | 'ready', value?: unknown): ConfigFormSnapshot<unknown> {
  return { status, value, base: {}, user: {}, revision: 1, writable: true, mode: 'host' }
}

/** One settings form a test settles by hand. */
function fakeForm(initial: ConfigFormSnapshot<unknown>) {
  let current = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    settle(next: ConfigFormSnapshot<unknown>): void {
      current = next
      for (const listener of listeners) listener()
    },
    listening: () => listeners.size,
  }
}

afterEach(() => { vi.useRealTimers() })

it('keeps unmanaged routes, the deployment default, and configured profiles', () => {
  expect(routableRoutes(
    ['deepseek-local', 'openrouter', 'custom'],
    new Set(['openrouter', 'custom']),
    new Map([['openrouter', 'TEAM_KEY'], ['custom', undefined]]),
    credentials,
    'deepseek-local',
  )).toEqual(['deepseek-local', 'openrouter', 'custom'])
})

it('hides an unconfigured route and one whose named credential is not stored, whatever the default is', () => {
  expect(routableRoutes(
    ['default', 'unconfigured', 'unloaded', 'keyless'],
    new Set(['default', 'unconfigured', 'unloaded', 'keyless']),
    new Map([['keyless', undefined], ['unloaded', 'EMPTY_KEY']]),
    credentials,
    'default',
  )).toEqual(['default', 'keyless'])
})

it('reads a key reference only from a profile that names one', () => {
  expect(apiKeyEnvAt(undefined)).toBeUndefined()
  expect(apiKeyEnvAt('TEAM_KEY')).toBeUndefined()
  expect(apiKeyEnvAt({})).toBeUndefined()
  expect(apiKeyEnvAt({ apiKeyEnv: '' })).toBeUndefined()
  expect(apiKeyEnvAt({ apiKeyEnv: 42 })).toBeUndefined()
  expect(apiKeyEnvAt({ apiKeyEnv: 'TEAM_KEY' })).toBe('TEAM_KEY')
})

it('walks a provider settings path and stops where the section ends', () => {
  expect(profileAt({ providers: { openai: { apiKeyEnv: 'TEAM_KEY' } } }, ['providers', 'openai']))
    .toEqual({ apiKeyEnv: 'TEAM_KEY' })
  expect(profileAt({ providers: {} }, ['providers', 'openai'])).toBeUndefined()
  expect(profileAt('section', ['providers'])).toBeUndefined()
  expect(profileAt({ section: 'value' }, [])).toEqual({ section: 'value' })
})

it('reads a settled form at once and subscribes only while a load is pending', async () => {
  const ready = fakeForm(snapshot('ready', {}))
  expect(await settledSettings(ready)).toBe(ready.getSnapshot())
  expect(ready.listening()).toBe(0)

  const loading = fakeForm(snapshot('loading'))
  const pending = settledSettings(loading)
  expect(loading.listening()).toBe(1)
  loading.settle(snapshot('ready', { providers: {} }))
  expect(await pending).toEqual(snapshot('ready', { providers: {} }))
  expect(loading.listening()).toBe(0)
})

it('gives up on a form that never leaves its first load', async () => {
  vi.useFakeTimers()
  const loading = fakeForm(snapshot('loading'))
  const pending = settledSettings(loading)
  await vi.advanceTimersByTimeAsync(2000)
  expect(await pending).toBeUndefined()
  expect(loading.listening()).toBe(0)
})

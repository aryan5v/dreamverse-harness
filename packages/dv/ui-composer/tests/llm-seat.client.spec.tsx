// @vitest-environment jsdom
/** The DreamVerse LLM seat lists a configurable provider only once its settings profile exists. */
import { act, cleanup, fireEvent, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { apply, inject } from '../src/client/index.ts'

beforeEach(() => { document.documentElement.lang = 'en' })
afterEach(() => { cleanup(); vi.useRealTimers() })

const groups = ['deepseek', 'openrouter', 'local', 'bare'].map(id => ({ id, name: id.toUpperCase(), models: [{ id: `${id}-m`, name: `${id} model` }] }))

interface Options {
  catalog?: { ok: boolean; value?: unknown }
  providers?: { ok: boolean; value?: unknown }
  forms?: 'none' | 'ready' | 'loading' | 'stuck'
}

async function mount(options: Options = {}) {
  const runtime = await SlotTestRuntime.create()
  const directory = createSnapshotStore({ current: null, routable: true, groups: groups as never, failures: [], status: 'ready', error: null })
  const select = vi.fn(async () => undefined)
  const load = vi.fn(async () => {})
  runtime.ctx.provide('inputTriggers', { registerSource: () => () => {} } as never)
  runtime.ctx.provide('sidebarRight', { mounted: { getSnapshot: () => undefined }, openTab: () => {} } as never)
  runtime.ctx.provide('modelDirectories', { directoryFor: () => ({ store: directory, load, select }) } as never)
  runtime.remote.provideNamespaces({
    session: { modelCatalog: async () => options.catalog ?? { ok: true, value: { routableProviders: ['deepseek', 'openrouter', 'local', 'bare'], default: { provider: 'deepseek' } } } },
    llm: { listConfigurableProviders: async () => options.providers ?? { ok: true, value: [
      { provider: 'openrouter', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'openrouter'] },
      { provider: 'local', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'local'] },
      { provider: 'bare', settingsNs: 'llm-bare', settingsPath: [] },
    ] } },
    credentials: {},
  })
  const listeners = new Set<() => void>()
  let piAi: unknown = options.forms === 'loading' || options.forms === 'stuck'
    ? { status: 'loading' } : { status: 'ready', value: { providers: { openrouter: { apiKeyEnv: 'K' } } } }
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }
  const form = (value: () => unknown) => ({ getSnapshot: value, subscribe })
  if (options.forms !== 'none') {
    runtime.ctx.provide('configForms', { get: (ns: string) => form(ns === 'llm-pi-ai' ? () => piAi : () => ({ status: 'ready', value: {} })) } as never)
  }
  runtime.ctx.provide('dvCloudModels', { getSnapshot: () => [{ id: 'openrouter', name: 'OpenRouter', logo: () => <i data-testid="logo" /> }] } as never)
  await runtime.root.declare({ 'conversation.input.model': { kind: 'single', scope: 'session' } }, props => (
    <props.SessionProvider session={runtime.sessions.retain(session)}>{props.renderSlot('conversation.input.model', { locked: false })}</props.SessionProvider>
  ))
  const session = await runtime.sessions.add({ id: 's1' })
  await runtime.mount({ inject: [...inject], apply })
  return { runtime, directory, select, load, ready: () => { piAi = { status: 'ready', value: { providers: { openrouter: {} } } }; for (const l of listeners) l() } }
}

const optionsOf = async (view: ReturnType<SlotTestRuntime['renderRoot']>) => {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
  fireEvent.click(view.getByRole('button', { name: /^Language model/ }))
  return within(document.body).getAllByRole('option').map(option => option.textContent)
}

it('lists a configurable provider once its profile exists, and a provider whose section is the profile', async () => {
  const { runtime } = await mount()
  const shown = await optionsOf(runtime.renderRoot())
  expect(shown.some(text => text?.includes('deepseek model'))).toBe(true)
  expect(shown.some(text => text?.includes('openrouter model'))).toBe(true)
  expect(shown.some(text => text?.includes('local model'))).toBe(false)
  expect(shown.some(text => text?.includes('bare model'))).toBe(true)
  await runtime.dispose()
})

it('waits for a settings document that is still loading', async () => {
  const { runtime, ready } = await mount({ forms: 'loading' })
  const view = runtime.renderRoot()
  setTimeout(ready, 5)
  const shown = await optionsOf(view)
  expect(shown.some(text => text?.includes('openrouter model'))).toBe(true)
  await runtime.dispose()
})

it('lists every routable provider when the directory, the forms, or the catalog cannot be read', async () => {
  for (const options of [{ providers: { ok: false } }, { forms: 'none' as const }, { catalog: { ok: false } }]) {
    const { runtime } = await mount(options)
    const shown = await optionsOf(runtime.renderRoot())
    expect(shown.some(text => text?.includes('local model'))).toBe(true)
    await runtime.dispose()
    cleanup()
  }
})

it('lists every routable provider when a settings document never loads', async () => {
  vi.useFakeTimers()
  const { runtime } = await mount({ forms: 'stuck' })
  const view = runtime.renderRoot()
  await act(async () => { await vi.advanceTimersByTimeAsync(2100) })
  fireEvent.click(view.getByRole('button', { name: /^Language model/ }))
  expect(within(document.body).getAllByRole('option').some(option => option.textContent?.includes('local model'))).toBe(true)
  await runtime.dispose()
})

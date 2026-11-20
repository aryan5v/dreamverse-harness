// @vitest-environment jsdom
/** Select models offered by different providers in one table. */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { cloudSelection, type CloudModel, type CloudModelSettings } from '@dv/ui-kit/cloud-model-settings.ts'
import { createRegistry } from '@dv/ui-kit/registries.ts'
import { CloudModels } from '../src/client/CloudModelsSettings.tsx'

afterEach(cleanup)

function provider(id: string, name: string, model: CloudModel, enabled: boolean): CloudModelSettings {
  let configured = { enabled: enabled ? [model] : [] }
  const listeners = new Set<() => void>()
  const settings = cloudSelection({
    getSnapshot: () => configured,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
  }, state => ({ writable: true, enabled: state.enabled }))
  return {
    id, name, media: [model.media], settings,
    load: vi.fn(async () => ({ models: [model] })),
    setEnabled: vi.fn(async (model, next) => {
      configured = { enabled: next ? [model] : [] }
      for (const listener of listeners) listener()
    }),
  }
}

it('loads provider catalogs into one source-aware table and reflects saved picker choices', async () => {
  const previous = document.documentElement.lang
  document.documentElement.lang = 'en'
  const providers = createRegistry<CloudModelSettings>(p => [p.id], p => p.name)
  const openrouter = provider('openrouter', 'OpenRouter', { id: 'google/veo', name: 'Veo', media: 'video' }, true)
  const reactor = provider('reactor', 'Reactor', { id: 'reactor/fast-h3', name: 'FastH3', media: 'video' }, false)
  providers.register(openrouter)
  providers.register(reactor)
  try {
    render(<CloudModels providers={providers.getSnapshot()} />)
    const table = screen.getByRole('table', { name: 'Generation models' })
    expect(within(table).getByRole('columnheader', { name: 'Source' })).toBeTruthy()
    const veo = within(table).getByRole<HTMLInputElement>('checkbox', { name: 'Use OpenRouter Veo in video picker' })
    expect(veo.checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Configure Reactor' }))
    fireEvent.click(screen.getByRole('button', { name: 'Load models' }))
    const fast = await within(table).findByRole<HTMLInputElement>('checkbox', { name: 'Use Reactor FastH3 in video picker' })
    expect(fast.checked).toBe(false)
    fireEvent.click(fast)
    await waitFor(() => { expect(fast.checked).toBe(true) })
    expect(reactor.setEnabled).toHaveBeenCalledWith(expect.objectContaining({ id: 'reactor/fast-h3' }), true)
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by source' }), { target: { value: 'reactor' } })
    expect(within(table).queryByText('Veo')).toBeNull()
    fireEvent.click(fast)
    await waitFor(() => { expect(fast.checked).toBe(false) })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Enabled only' }))
    expect(within(table).queryByText('FastH3')).toBeNull()
  } finally {
    document.documentElement.lang = previous
  }
})

// @vitest-environment jsdom
/** Generation provider connections show the saved key and balance; one paged table selects models of every provider. */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { cloudSelection, type CloudAccount, type CloudModel, type CloudModelSettings } from '@dv/ui-kit/cloud-model-settings.ts'
import { createRegistry } from '@dv/ui-kit/registries.ts'
import { CloudConnections } from '../src/client/cloud-connections.ts'
import { Connections, ModelTable } from '../src/client/CloudModelsSettings.tsx'

afterEach(cleanup)

function provider(id: string, name: string, models: readonly CloudModel[], enabled: boolean, account: CloudAccount): CloudModelSettings {
  let configured = { enabled: enabled ? models.slice(0, 1) : [] }
  const listeners = new Set<() => void>()
  const settings = cloudSelection({
    getSnapshot: () => configured,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
  }, state => ({ writable: true, enabled: state.enabled }))
  return {
    id, name, domain: `${id}.example`, keyUrl: `https://${id}.example/keys`, logo: () => null,
    media: [...new Set(models.map(model => model.media))], settings,
    account: vi.fn(async () => account),
    load: vi.fn(async () => ({ models })),
    setEnabled: vi.fn(async (model, next) => {
      configured = { enabled: next ? [model] : [] }
      for (const listener of listeners) listener()
    }),
  }
}

it('shows saved keys with balances and pages one source-aware table of picker choices', async () => {
  const previous = document.documentElement.lang
  document.documentElement.lang = 'en'
  const providers = createRegistry<CloudModelSettings>(p => [p.id], p => p.name)
  const many = Array.from({ length: 14 }, (_, index) => ({ id: `google/veo-${index}`, name: `Veo ${String(index).padStart(2, '0')}`, media: 'video' as const }))
  const openrouter = provider('openrouter', 'OpenRouter', many, true, { status: 'connected', balanceUsd: 12.5 })
  const reactor = provider('reactor', 'Reactor', [{ id: 'reactor/fast-h3', name: 'FastH3', media: 'video' }], false, { status: 'missing' })
  providers.register(openrouter)
  providers.register(reactor)
  const connections = new CloudConnections()
  try {
    render(<>
      <Connections providers={providers} connections={connections} />
      <ModelTable providers={providers} connections={connections} />
    </>)
    const openrouterRow = await screen.findByRole('button', { name: 'Manage OpenRouter' })
    await waitFor(() => { expect(within(openrouterRow).getByText('Key saved')).toBeTruthy() })
    expect(within(openrouterRow).getByText('$12.50')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Manage Reactor' })).toBeNull()
    expect(reactor.load).not.toHaveBeenCalled()

    const table = screen.getByRole('table', { name: 'Model catalog' })
    await waitFor(() => { expect(within(table).getByText('Veo 00')).toBeTruthy() })
    expect(screen.getByText('1–12 of 14')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('13–14 of 14')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Add a connection' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Add a connection' })).getByRole('button', { name: /Reactor/ }))
    const sheet = screen.getByRole('dialog', { name: 'Connect Reactor' })
    fireEvent.change(within(sheet).getByPlaceholderText('Paste your API key'), { target: { value: 'rk_fixture' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save key' }))
    await within(sheet).findByText('Key works. Models loaded.')
    expect(reactor.load).toHaveBeenCalledWith('rk_fixture', expect.any(AbortSignal))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }))

    fireEvent.click(screen.getByRole('button', { name: 'Provider' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search providers' }), { target: { value: 'react' } })
    expect(screen.queryByRole('menuitem', { name: 'OpenRouter' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reactor' }))
    const fast = within(table).getByRole('switch', { name: 'Use FastH3 in the picker' })
    expect(fast.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(fast)
    await waitFor(() => { expect(fast.getAttribute('aria-checked')).toBe('true') })
    expect(reactor.setEnabled).toHaveBeenCalledWith(expect.objectContaining({ id: 'reactor/fast-h3' }), true)
    expect(within(table).queryByText('Veo 00')).toBeNull()
  } finally {
    connections.dispose()
    document.documentElement.lang = previous
  }
})

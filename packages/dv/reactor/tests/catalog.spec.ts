/** Check pagination and validation of Reactor's official model listing. */
import { afterEach, expect, it, vi } from 'vitest'
import { listModels } from '../src/catalog.ts'

afterEach(() => vi.unstubAllGlobals())

it('lists both configured and unconfigured model IDs across pages without creating sessions', async () => {
  const first = Array.from({ length: 200 }, (_, index) => ({ name: `fixture/model-${index}`, status: 'active', is_public: true }))
  const last = [{ name: 'fixture/private-model', status: 'deprecated', description: 'Shared model' }]
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json(first))
    .mockResolvedValueOnce(Response.json(last))
  vi.stubGlobal('fetch', fetch)
  const signal = new AbortController().signal

  const models = await listModels('rk_fixture', signal)
  expect(models).toHaveLength(201)
  expect(models[0]).toEqual({ name: 'fixture/model-0', status: 'active' })
  expect(models.at(-1)).toEqual(last[0])
  expect(fetch.mock.calls.map(([url]) => url instanceof URL ? url.href : url)).toEqual([
    'https://api.reactor.inc/models?limit=200&offset=0', 'https://api.reactor.inc/models?limit=200&offset=200',
  ])
  expect(fetch.mock.calls[0]?.[1]).toEqual({
    headers: { Authorization: 'Bearer rk_fixture' }, signal, redirect: 'error',
  })
})

it('reports invalid credentials and malformed catalog data', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(Response.json([{ name: 'fixture/model', status: 'unknown' }]))
  vi.stubGlobal('fetch', fetch)
  const signal = new AbortController().signal
  await expect(listModels('rk_fixture', signal)).rejects.toThrow('HTTP 401')
  await expect(listModels('rk_fixture', signal)).rejects.toThrow('invalid model name or status')
})

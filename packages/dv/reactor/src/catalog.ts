/** Read the Reactor account's published model list without opening sessions. */

interface Model {
  name: string
  status: 'active' | 'deprecated' | 'disabled'
  description?: string
}

const PAGE_SIZE = 200

/** The Reactor catalog rejected an authenticated request. */
export class ReactorCatalogError extends Error {
  /** @param status - the status returned by Reactor's catalog endpoint. */
  constructor(readonly status: number) {
    super(`Reactor model catalog returned HTTP ${status}.`)
  }
}

async function modelPage(apiKey: string, apiBaseUrl: string, signal: AbortSignal, limit: number, offset: number): Promise<unknown[]> {
  const url = new URL('/models', apiBaseUrl)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('offset', String(offset))
  const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, signal, redirect: 'error' })
  if (!response.ok) throw new ReactorCatalogError(response.status)
  const raw: unknown = await response.json()
  if (!Array.isArray(raw)) throw new Error('Reactor returned an invalid model catalog.')
  const rows: unknown[] = raw
  return rows
}

/**
 * Check whether Reactor accepts the host's key by reading one page of its model catalog.
 * @param apiKey - the host's Reactor API key.
 * @param signal - aborts the catalog request.
 * @param apiBaseUrl - the Reactor API origin, without a trailing slash.
 * @throws ReactorCatalogError when Reactor rejects the request.
 */
export async function checkAccess(apiKey: string, signal: AbortSignal, apiBaseUrl: string): Promise<void> {
  await modelPage(apiKey, apiBaseUrl, signal, 1, 0)
}

/**
 * List the models visible to an API key, including models without a DreamVerse shot workflow.
 * @param apiKey - the host's Reactor API key.
 * @param signal - stops upstream requests when the caller closes the connection.
 * @param apiBaseUrl - the Reactor API origin, without a trailing slash.
 * @returns model IDs and status from the Reactor Platform API.
 */
export async function listModels(apiKey: string, signal: AbortSignal, apiBaseUrl: string): Promise<Model[]> {
  const models: Model[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const rows = await modelPage(apiKey, apiBaseUrl, signal, PAGE_SIZE, offset)
    for (const row of rows) {
      if (typeof row !== 'object' || row === null) throw new Error('Reactor returned an invalid model entry.')
      const name: unknown = Reflect.get(row, 'name')
      const status: unknown = Reflect.get(row, 'status')
      const description: unknown = Reflect.get(row, 'description')
      if (typeof name !== 'string' || (status !== 'active' && status !== 'deprecated' && status !== 'disabled')) {
        throw new Error('Reactor returned an invalid model name or status.')
      }
      models.push({ name, status, ...typeof description === 'string' ? { description } : {} })
    }
    if (rows.length < PAGE_SIZE) return models
  }
}

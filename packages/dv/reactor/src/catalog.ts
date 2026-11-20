/** Read the Reactor account's published model list without opening sessions. */

interface Model {
  name: string
  status: 'active' | 'deprecated' | 'disabled'
  description?: string
}

const CATALOG_URL = 'https://api.reactor.inc/models'
const PAGE_SIZE = 200

const API_ORIGIN = 'https://api.reactor.inc'

/** The account an API key acts in, with its remaining balance in US dollars. */
export interface ReactorAccount { label: string | null; balanceUsd: number | null }

/**
 * Read the account of an API key and its credit balance.
 * @param apiKey - the host's Reactor API key.
 * @param signal - stops upstream requests when the caller closes the connection.
 * @returns the user's email and the account's balance; a balance Reactor reports as unavailable is null.
 * @throws ReactorCatalogError when Reactor rejects the key.
 */
export async function readAccount(apiKey: string, signal: AbortSignal): Promise<ReactorAccount> {
  const get = (path: string): Promise<Response> =>
    fetch(new URL(path, API_ORIGIN), { headers: { Authorization: `Bearer ${apiKey}` }, signal, redirect: 'error' })
  const me = await get('/me')
  if (!me.ok) throw new ReactorCatalogError(me.status)
  const user: unknown = await me.json()
  const account: unknown = typeof user === 'object' && user !== null ? Reflect.get(user, 'account_id') : undefined
  const email: unknown = typeof user === 'object' && user !== null ? Reflect.get(user, 'email') : undefined
  const label = typeof email === 'string' ? email : null
  if (typeof account !== 'string' || account === '') return { label, balanceUsd: null }
  const credits = await get(`/accounts/${encodeURIComponent(account)}/credits`)
  if (credits.status === 401 || credits.status === 403) throw new ReactorCatalogError(credits.status)
  if (!credits.ok) return { label, balanceUsd: null }
  const body: unknown = await credits.json()
  const usd: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'balance_usd') : undefined
  const balance = typeof usd === 'string' ? Number(usd) : NaN
  return { label, balanceUsd: Number.isFinite(balance) ? balance : null }
}

/** The Reactor catalog rejected an authenticated request. */
export class ReactorCatalogError extends Error {
  /** @param status - the status returned by Reactor's catalog endpoint. */
  constructor(readonly status: number) {
    super(`Reactor model catalog returned HTTP ${status}.`)
  }
}

/**
 * List the models visible to an API key, including models without a DreamVerse shot workflow.
 * @param apiKey - the host's Reactor API key.
 * @param signal - stops upstream requests when the caller closes the connection.
 * @returns model IDs and status from the Reactor Platform API.
 */
export async function listModels(apiKey: string, signal: AbortSignal): Promise<Model[]> {
  const models: Model[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = new URL(CATALOG_URL)
    url.searchParams.set('limit', String(PAGE_SIZE))
    url.searchParams.set('offset', String(offset))
    const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, signal, redirect: 'error' })
    if (!response.ok) throw new ReactorCatalogError(response.status)
    const raw: unknown = await response.json()
    if (!Array.isArray(raw)) throw new Error('Reactor returned an invalid model catalog.')
    const rows: unknown[] = raw
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
    if (raw.length < PAGE_SIZE) return models
  }
}

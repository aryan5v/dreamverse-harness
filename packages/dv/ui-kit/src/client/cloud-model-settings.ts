/** Provider contributions to the generation model settings table. */
import type { ComponentType } from 'react'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { Registry } from './registries.ts'

/** Output type shown in the table and composer. */
export type CloudMedia = 'video' | 'image' | 'audio'

/** One provider model, grouped independently of the tasks it serves. */
export interface CloudModel {
  id: string
  name: string
  media: CloudMedia
  unavailable?: 'catalog' | 'provider' | 'workflow'
}

/** Effective provider settings read from the host. */
export interface CloudSelection {
  writable: boolean
  enabled: readonly CloudModel[]
}

/** A catalog response or a credential problem that requires a new key. */
export type CloudCatalogResult = { models: readonly CloudModel[]; warning?: string }
  | { credentialError: 'missing' | 'rejected' }

/**
 * The saved credential's state and the provider's remaining balance. `missing` means no key is saved; `rejected`
 * means the provider refused the saved key; `unavailable` means the account could not be read for another reason.
 */
export type CloudAccount = { status: 'missing' | 'rejected' | 'unavailable' }
  | { status: 'connected'; balanceUsd: number | null; label?: string }

/** A credential editor and a model catalog supplied by a provider plugin. */
export interface CloudModelSettings {
  id: string
  name: string
  /** The provider's host name shown under its name, such as `openrouter.ai`. */
  domain: string
  /** Where the user creates an API key. */
  keyUrl: string
  /** The provider's logo, drawn in `currentColor` at the given pixel size. */
  logo: ComponentType<{ size: number }>
  media: readonly CloudMedia[]
  settings: HostObservable<CloudSelection>
  /**
   * Read the saved key's state and the remaining balance.
   * @param signal - cancels the request.
   */
  account(signal: AbortSignal): Promise<CloudAccount>
  /**
   * Save a non-empty key, then read the catalog with the saved key.
   * @param apiKey - the new key, or an empty string to keep the saved key.
   * @param signal - cancels the request.
   */
  load(apiKey: string, signal: AbortSignal): Promise<CloudCatalogResult>
  setEnabled(model: CloudModel, enabled: boolean): Promise<void>
  enableOperator?(apiKey: string): Promise<void>
}

/**
 * Read a provider's `/api/dv/<provider>/account` route.
 * @param url - the same-origin account route.
 * @param signal - cancels the request.
 * @returns the account state; an answer that is not a known state reads as `unavailable`.
 */
export async function fetchCloudAccount(url: string, signal: AbortSignal): Promise<CloudAccount> {
  const response = await fetch(url, { signal })
  if (!response.ok) return { status: 'unavailable' }
  const body = await response.json() as { status?: unknown; balanceUsd?: unknown; label?: unknown }
  if (body.status === 'missing' || body.status === 'rejected' || body.status === 'unavailable') return { status: body.status }
  if (body.status !== 'connected') return { status: 'unavailable' }
  return { status: 'connected', balanceUsd: typeof body.balanceUsd === 'number' ? body.balanceUsd : null,
    ...typeof body.label === 'string' ? { label: body.label } : {} }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    dvCloudModels: Registry<CloudModelSettings>
  }
}

/**
 * Project a settings observable, keeping the result stable until the source changes.
 * @param source - the provider's revisioned configuration form.
 * @param project - reads the editable state and enabled models.
 * @returns a settings observable for the table.
 */
export function cloudSelection<S>(source: HostObservable<S>, project: (value: S) => CloudSelection): HostObservable<CloudSelection> {
  let last = source.getSnapshot()
  let selection = project(last)
  return {
    subscribe: listener => source.subscribe(listener),
    getSnapshot() {
      const next = source.getSnapshot()
      if (last !== next) {
        last = next
        selection = project(next)
      }
      return selection
    },
  }
}

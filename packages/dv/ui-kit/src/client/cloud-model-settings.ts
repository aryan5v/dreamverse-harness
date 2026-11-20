/** Provider contributions to the generation model settings table. */
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

/** A credential editor and a model catalog supplied by a provider plugin. */
export interface CloudModelSettings {
  id: string
  name: string
  media: readonly CloudMedia[]
  settings: HostObservable<CloudSelection>
  load(apiKey: string, signal: AbortSignal): Promise<CloudCatalogResult>
  setEnabled(model: CloudModel, enabled: boolean): Promise<void>
  enableOperator?(apiKey: string): Promise<void>
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

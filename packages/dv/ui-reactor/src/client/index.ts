/** Mount Reactor's credential and model setup in DreamVerse Settings. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ReactorCatalog, ReactorSettings } from '@dv/reactor/types'
import { fetchCloudAccount } from '@dv/ui-kit/cloud-model-settings.ts'
import { reactorSettings } from './settings.ts'

/** Settings and credential RPC services used by the page. */
export const inject = ['dvCloudModels', 'configForms', 'remote', 'remote.credentials']

/**
 * Add the Reactor page to Settings.
 * @param ctx - browser plugin context that owns the slot registration.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.dvCloudModels.register(reactorSettings({
    form: ctx.configForms.get<ReactorSettings>('dv-reactor'),
    account: signal => fetchCloudAccount('/api/dv/reactor/account', signal),
    storeKey: async (ref: string, key: string) => {
      if (!(await ctx.remote.credentials.set(ref, key)).ok) throw new Error('Could not store the Reactor key.')
    },
    discover: async (signal) => {
      const response = await fetch('/api/dv/reactor/catalog', { signal })
      if (response.status === 401) return { credentialError: 'rejected' }
      if (response.status === 503) return { credentialError: 'missing' }
      if (!response.ok) throw new Error('Could not load the Reactor catalog.')
      return await response.json() as ReactorCatalog
    },
  })), 'reactor: cloud model settings')
}

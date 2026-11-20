/** OpenRouter video and image setup in the existing Settings shell. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ImageModel, OpenRouterCatalog, OpenRouterSettings, SpeechModel, VideoModel } from '@dv/openrouter/types'
import { fetchCloudAccount } from '@dv/ui-kit/cloud-model-settings.ts'
import { openRouterSettings } from './settings.ts'

export const inject = ['dvCloudModels', 'configForms', 'remote', 'remote.credentials']

/**
 * Read the OpenRouter profile as the user layer stores it.
 * @param user - the raw user layer of the `llm-pi-ai` namespace.
 * @returns the profile, or undefined when the person has not overridden the route.
 */
function userProfile(user: unknown): { apiKeyEnv?: unknown } | undefined {
  if (typeof user !== 'object' || user === null) return undefined
  const providers = (user as { providers?: unknown }).providers
  if (typeof providers !== 'object' || providers === null) return undefined
  const profile = (providers as Record<string, unknown>)['openrouter']
  return typeof profile === 'object' && profile !== null ? profile as { apiKeyEnv?: unknown } : undefined
}
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.dvCloudModels.register(openRouterSettings({
    form: ctx.configForms.get<OpenRouterSettings>('dv-openrouter'),
    account: signal => fetchCloudAccount('/api/dv/openrouter/account', signal),
    enableOperator: async (ref: string) => {
      const form = ctx.configForms.get<{ providers: Record<string, Record<string, unknown>> }>('llm-pi-ai')
      const state = form.getSnapshot()
      if (state.status !== 'ready' || !state.writable) throw new Error('Operator settings are unavailable.')
      // Only the user layer is extended: whatever the composition supplies keeps coming from there, and the chat
      // option stays the one field this page owns.
      if (!await form.mutate([{ op: 'set', path: ['providers', 'openrouter'],
        value: { ...userProfile(state.user) ?? {}, apiKeyEnv: ref } }], state.revision)) {
        throw new Error('Operator settings changed. Try again.')
      }
    },
    disableOperator: async () => {
      const form = ctx.configForms.get<{ providers: Record<string, Record<string, unknown>> }>('llm-pi-ai')
      const state = form.getSnapshot()
      if (state.status !== 'ready' || !state.writable) throw new Error('Operator settings are unavailable.')
      // This page is the only writer of the user-layer openrouter profile, and removing that layer is what turns the
      // route off for this person: a composition-supplied profile stays where it is, and operatorEnabled reads the
      // user layer, so the chat option stays off and the composer keeps the composed route out of the picker.
      if (!await form.mutate([{ op: 'unset', path: ['providers', 'openrouter'] }], state.revision)) {
        throw new Error('Operator settings changed. Try again.')
      }
    },
    operatorEnabled: () => {
      // The user layer alone: a route the composition configures is not what this checkbox turned on, so its presence
      // there must not read as the person's choice.
      const profile = userProfile(ctx.configForms.get<unknown>('llm-pi-ai').getSnapshot().user)
      return typeof profile?.apiKeyEnv === 'string' && profile.apiKeyEnv !== ''
    },
    storeKey: async (ref: string, key: string) => {
      if (!(await ctx.remote.credentials.set(ref, key)).ok) throw new Error('Could not store the API key.')
    },
    discover: async (signal): Promise<OpenRouterCatalog> => {
      const response = await fetch('/api/dv/openrouter/catalog', { signal: signal ?? null })
      if (!response.ok) throw new Error('OpenRouter model discovery failed.')
      const value = await response.json() as { data: VideoModel[]; images: ImageModel[]; speech: SpeechModel[]; error: string | null }
      return { videos: value.data, images: value.images, speech: value.speech, error: value.error }
    },
  })), 'openrouter: cloud model settings')
}

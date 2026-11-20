/** OpenRouter video and image setup in the existing Settings shell. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ImageModel, OpenRouterCatalog, OpenRouterSettings, SpeechModel, VideoModel } from '@dv/openrouter/types'
import { fetchCloudAccount } from '@dv/ui-kit/cloud-model-settings.ts'
import { openRouterSettings } from './settings.ts'

export const inject = ['dvCloudModels', 'configForms', 'remote', 'remote.credentials']
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.dvCloudModels.register(openRouterSettings({
    form: ctx.configForms.get<OpenRouterSettings>('dv-openrouter'),
    account: signal => fetchCloudAccount('/api/dv/openrouter/account', signal),
    enableOperator: async (ref: string) => {
      const form = ctx.configForms.get<{ providers: Record<string, Record<string, unknown>> }>('llm-pi-ai')
      const state = form.getSnapshot()
      if (state.status !== 'ready' || !state.writable) throw new Error('Operator settings are unavailable.')
      const profile = state.value?.providers['openrouter'] ?? {}
      if (!await form.mutate([{ op: 'set', path: ['providers', 'openrouter'], value: { ...profile, apiKeyEnv: ref } }],
        state.revision)) throw new Error('Operator settings changed. Try again.')
    },
    operatorEnabled: () => {
      const state = ctx.configForms.get<{ providers: Record<string, { apiKeyEnv?: unknown }> }>('llm-pi-ai').getSnapshot()
      const profile = state.status === 'ready' ? state.value?.providers['openrouter'] : undefined
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

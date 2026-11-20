/** Browser settings and discovery types for the Reactor provider. */

/** One configured DreamVerse alias and its Reactor deployment. */
export type ReactorModelConfig<Profile extends string = string> = {
  profile: Profile
  modelId?: string
  durationsSec?: number[]
}

/** Fields the Reactor settings page reads from the provider row. */
export interface ReactorSettings {
  credentialRef?: string
  models?: Record<string, ReactorModelConfig>
}

/** One account-visible listing and its DreamVerse model choices. */
export interface ReactorCatalogModel {
  name: string
  status: 'active' | 'deprecated' | 'disabled'
  description?: string
  profile?: string
  displayName?: string
  shotModels: string[]
}

/** Reactor's authenticated model listing through the DreamVerse host. */
export interface ReactorCatalog {
  models: ReactorCatalogModel[]
}

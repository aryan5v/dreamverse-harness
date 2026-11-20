/** The chat picker's route join: a route is offered once a profile configures it and its named key is stored. */
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'

/** One credential reference's state, as `remote.credentials.describe` reports it. */
export interface CredentialState { configured: boolean }

/**
 * The chat routes a picker may offer: every route the deployment registers, minus a configurable route that no
 * settings profile configures, and minus a configured route whose named key reference holds no credential.
 * @param routes - the route ids the host can serve.
 * @param managed - the routes a settings namespace configures; the other ids are not this join's to hide.
 * @param profiles - each configured route's key reference, or undefined when its profile names none.
 * @param credentials - the described state of every reference those profiles name.
 * @param defaultProvider - the deployment default, offered whether or not its profile is configured.
 * @returns the route ids to offer, in the order they were given.
 */
export function routableRoutes(
  routes: readonly string[],
  managed: ReadonlySet<string>,
  profiles: ReadonlyMap<string, string | undefined>,
  credentials: Readonly<Record<string, CredentialState>>,
  defaultProvider: string,
): string[] {
  return routes.filter((route) => {
    if (route === defaultProvider || !managed.has(route)) return true
    if (!profiles.has(route)) return false
    const ref = profiles.get(route)
    return ref === undefined || credentials[ref]?.configured === true
  })
}

/**
 * The key reference one provider profile names.
 * @param profile - the profile object stored at the provider's settings path.
 * @returns the reference, or undefined when the profile authenticates through the provider itself.
 */
export function apiKeyEnvAt(profile: unknown): string | undefined {
  if (typeof profile !== 'object' || profile === null) return undefined
  const ref = (profile as { apiKeyEnv?: unknown }).apiKeyEnv
  return typeof ref === 'string' && ref !== '' ? ref : undefined
}

/**
 * Read a provider's profile inside its settings section.
 * @param value - the section value of the provider's settings namespace.
 * @param path - the path the provider directory declares; empty when the section itself is the profile.
 * @returns the profile, or undefined when nothing is configured there.
 */
export function profileAt(value: unknown, path: readonly string[]): unknown {
  let node = value
  for (const key of path) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[key]
  }
  return node
}

/** How long a readiness read waits for a settings namespace that is still loading before it gives up. */
const SETTINGS_WAIT_MS = 2000

/**
 * Read one settings form once its first load has settled, so an unloaded document is not mistaken for an unconfigured
 * provider.
 * @param form - the shared form of one settings namespace.
 * @returns the first settled snapshot, or undefined when the form stayed loading.
 */
export async function settledSettings(
  form: { getSnapshot(): ConfigFormSnapshot<unknown>; subscribe(listener: () => void): () => void },
): Promise<ConfigFormSnapshot<unknown> | undefined> {
  const first = form.getSnapshot()
  if (first.status !== 'loading') return first
  return await new Promise((resolve) => {
    let stop = (): void => {}
    const finish = (snapshot: ConfigFormSnapshot<unknown> | undefined): void => {
      clearTimeout(timer)
      stop()
      resolve(snapshot)
    }
    const timer = setTimeout(() => { finish(undefined) }, SETTINGS_WAIT_MS)
    stop = form.subscribe(() => {
      const next = form.getSnapshot()
      if (next.status !== 'loading') finish(next)
    })
  })
}

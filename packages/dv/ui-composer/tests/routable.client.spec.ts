/** The chat picker offers a route only once a profile configures it and the key that profile names is stored. */
import { expect, it } from 'vitest'
import { routableRoutes } from '../src/client/routable.ts'

const credentials = { TEAM_KEY: { configured: true }, EMPTY_KEY: { configured: false } }

it('keeps unmanaged routes, the deployment default, and configured profiles', () => {
  expect(routableRoutes(
    ['deepseek-local', 'openrouter', 'custom'],
    new Set(['openrouter', 'custom']),
    new Map([['openrouter', 'TEAM_KEY'], ['custom', undefined]]),
    credentials,
    'deepseek-local',
  )).toEqual(['deepseek-local', 'openrouter', 'custom'])
})

it('hides an unconfigured route and one whose named credential is not stored, whatever the default is', () => {
  expect(routableRoutes(
    ['default', 'unconfigured', 'unloaded', 'keyless'],
    new Set(['default', 'unconfigured', 'unloaded', 'keyless']),
    new Map([['keyless', undefined], ['unloaded', 'EMPTY_KEY']]),
    credentials,
    'default',
  )).toEqual(['default', 'keyless'])
})

/** Draw generation provider cards and their shared model selection table. */
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Button, IconGlobeOutlineRegular, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { type CloudMedia, type CloudModel, type CloudModelSettings, type CloudSelection } from '@dv/ui-kit/cloud-model-settings.ts'
import { useText } from '@dv/ui-kit/locale.ts'
import { createRegistry, type Registry } from '@dv/ui-kit/registries.ts'
import css from './CloudModelsSettings.module.css'

interface LoadedCatalog {
  models: readonly CloudModel[]
  warning?: string
}

const modelKey = ({ media, id }: CloudModel): string => `${media}/${id}`

interface ProviderSnapshot {
  provider: CloudModelSettings
  state: CloudSelection
}

function observeProviders(providers: readonly CloudModelSettings[]): HostObservable<readonly ProviderSnapshot[]> {
  const read = () => providers.map(provider => ({ provider, state: provider.settings.getSnapshot() }))
  let last = read()
  return {
    getSnapshot() {
      const next = read()
      if (next.some((value, index) => value.state !== last[index]?.state)) last = next
      return last
    },
    subscribe(listener) {
      const disposers = providers.map(provider => provider.settings.subscribe(listener))
      return () => { for (const dispose of disposers) dispose() }
    },
  }
}

function ProviderCards({ providers }: { providers: Registry<CloudModelSettings> }) {
  const registered = useSyncExternalStore(providers.subscribe, providers.getSnapshot)
  const ordered = useMemo(() => [...registered].sort((a, b) => a.name.localeCompare(b.name)), [registered])
  return ordered.length === 0 ? null : <CloudModels providers={ordered} />
}

/**
 * Mount the shared generation provider registry and the Models settings contribution.
 * @param ctx - the DreamVerse shell's browser context.
 */
export function applyCloudModelsSettings(ctx: Context): void {
  const providers = createRegistry<CloudModelSettings>(entry => [entry.id], entry => entry.name)
  ctx.reflect.provide('dvCloudModels', providers)
  ctx.effect(() => ctx.slots.inject('settings.models.footer', () => ctx.slots.register({
    name: 'settings.models.footer', id: 'dv-cloud-models',
    inject: () => ({ providers }),
  }, ProviderCards)), 'ui-shell: cloud model settings')
}

/**
 * Render configured models immediately and let users select more from loaded catalogs.
 * @param props - the model provider contributions to display.
 * @returns the generation settings section.
 */
export function CloudModels({ providers }: { providers: readonly CloudModelSettings[] }) {
  const text = useText()
  const providerState = useMemo(() => observeProviders(providers), [providers])
  const settings = useSyncExternalStore(providerState.subscribe, providerState.getSnapshot)
  const [catalogs, setCatalogs] = useState<ReadonlyMap<string, LoadedCatalog>>(() => new Map())
  const [active, setActive] = useState<string | null>(null)
  const [key, setKey] = useState('')
  const [source, setSource] = useState('')
  const [query, setQuery] = useState('')
  const [enabledOnly, setEnabledOnly] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ provider: string; error: boolean; message: string } | null>(null)
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  const connectionId = useId()
  const headingId = useId()
  const mediaName = (media: CloudMedia) => ({
    video: text('视频', 'Video'), image: text('图片', 'Image'), audio: text('音频', 'Audio'),
  })[media]
  const activeSettings = settings.find(({ provider }) => provider.id === active)
  const activeProvider = activeSettings?.provider

  const run = async (id: string, action: (signal: AbortSignal) => Promise<void>, failure: string): Promise<void> => {
    if (request.current !== null) return
    const controller = new AbortController()
    request.current = controller
    setPending(id)
    setFeedback(null)
    try {
      await action(controller.signal)
    } catch {
      if (!controller.signal.aborted) setFeedback({ provider: id, error: true, message: failure })
    } finally {
      request.current = null
      if (!controller.signal.aborted) setPending(null)
    }
  }
  const load = (provider: CloudModelSettings): void => {
    void run(provider.id, async (signal) => {
      const catalog = await provider.load(key.trim(), signal)
      signal.throwIfAborted()
      if ('credentialError' in catalog) {
        const message = catalog.credentialError === 'rejected'
          ? text('提供商拒绝了此 API 密钥。请输入有效的密钥。', 'The provider rejected the API key. Enter a valid key.')
          : text('请输入 API 密钥后加载模型。', 'Enter an API key to load models.')
        setFeedback({ provider: provider.id, error: true, message })
        return
      }
      setCatalogs(previous => new Map(previous).set(provider.id, catalog))
      setKey('')
      setFeedback({ provider: provider.id, error: false, message: text('已加载模型。', 'Models loaded.') })
    }, text('无法加载模型。请检查 API 密钥和连接。', 'Could not load models. Check the API key and connection.'))
  }
  const enableOperator = (provider: CloudModelSettings): void => {
    if (provider.enableOperator === undefined) return
    void run(provider.id, async () => {
      await provider.enableOperator?.(key.trim())
      setKey('')
      setFeedback({ provider: provider.id, error: false, message: text('现在可在聊天中选择 OpenRouter LLM。', 'You can now select an OpenRouter LLM in chat.') })
    }, text('无法启用聊天 LLM。请检查 API 密钥。', 'Could not enable the chat LLM. Check the API key.'))
  }

  const rows = settings.flatMap(({ provider, state }) => {
    const catalog = catalogs.get(provider.id)
    const models = new Map(state.enabled.map(model => [modelKey(model), {
      model: catalog === undefined ? model : { ...model, unavailable: 'catalog' as const }, enabled: true,
    }]))
    const enabled = new Set(models.keys())
    for (const model of catalog?.models ?? []) {
      const id = modelKey(model)
      models.set(id, { model, enabled: enabled.has(id) })
    }
    return Array.from(models.values(), row => ({ ...row, provider, writable: state.writable }))
  })
  const needle = query.trim().toLowerCase()
  const visible = rows.filter(({ model, provider, enabled }) =>
    (source === '' || provider.id === source) && (!enabledOnly || enabled)
    && `${model.name} ${model.id}`.toLowerCase().includes(needle))
    .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.model.name.localeCompare(b.model.name))
  const unavailable = {
    catalog: text('已从目录移除', 'Missing from catalog'),
    provider: text('提供商已禁用', 'Disabled by provider'),
    workflow: text('需要其他工作流', 'Requires a different workflow'),
  }

  return <section className={css.section} aria-labelledby={headingId}>
    <div>
      <h3 id={headingId}>{text('生成模型提供商', 'Generation providers')}</h3>
      <ul className={css.cards}>
        {settings.map(({ provider, state }) => {
          const count = state.enabled.length
          return <li key={provider.id} className={css.card}>
            <div className={css.providerHeading}>
              <span className={css.mark}><IconGlobeOutlineRegular size={18} /></span>
              <div><h4>{provider.name}</h4><p>{provider.media.map(mediaName).join(' · ')}</p></div>
            </div>
            <div className={css.cardFooter}>
              <span>{text(`已启用 ${count} 个`, `${count} enabled`)}</span>
              <Button variant="outline" aria-controls={connectionId} aria-expanded={active === provider.id}
                aria-label={text(`配置 ${provider.name}`, `Configure ${provider.name}`)} disabled={pending !== null}
                onClick={() => { setActive(active === provider.id ? null : provider.id); setKey('') }}>
                {active === provider.id ? text('关闭', 'Close') : text('配置', 'Configure')}
              </Button>
            </div>
          </li>
        })}
      </ul>
    </div>

    <div id={connectionId} hidden={activeProvider === undefined}>
      {activeProvider === undefined ? null : <form className={css.connection}
        onSubmit={(event) => { event.preventDefault(); load(activeProvider) }}>
        <fieldset disabled={pending !== null || !activeSettings?.state.writable}>
          <label><span>{text(`${activeProvider.name} API 密钥`, `${activeProvider.name} API key`)}</span>
            <Input type="password" autoComplete="new-password" value={key}
              placeholder={text('留空可使用已保存的密钥', 'Leave blank to use the saved key')}
              onChange={(event) => { setKey(event.target.value) }} />
          </label>
          <div className={css.actions}>
            <Button type="submit" variant="primary">{key.trim() === '' ? text('加载模型', 'Load models')
              : text('保存密钥并加载', 'Save key and load')}</Button>
            {activeProvider.enableOperator === undefined ? null : <Button type="button" variant="outline"
              onClick={() => { enableOperator(activeProvider) }}>{text('用于聊天 LLM', 'Use for chat LLM')}</Button>}
          </div>
        </fieldset>
        {pending === activeProvider.id ? <p role="status">{text('正在处理…', 'Working…')}</p> : null}
        {catalogs.get(activeProvider.id)?.warning === undefined ? null
          : <p role="alert">{catalogs.get(activeProvider.id)?.warning}</p>}
      </form>}
    </div>

    <div className={css.tableSection}>
      <header>
        <h3>{text('生成模型', 'Generation models')}</h3>
        <p>{text('启用的云端模型会显示在聊天选择器中。', 'Enable the cloud models you want in the chat picker.')}</p>
      </header>
      <div className={css.filters}>
        <label className={css.search}><span className={css.visuallyHidden}>{text('搜索模型', 'Search models')}</span>
          <Input type="search" placeholder={text('搜索模型', 'Search models')} value={query}
            onChange={(event) => { setQuery(event.target.value) }} />
        </label>
        <label><span className={css.visuallyHidden}>{text('来源筛选', 'Filter by source')}</span>
          <select value={source} onChange={(event) => { setSource(event.target.value) }}>
            <option value="">{text('所有来源', 'All sources')}</option>
            {providers.map(provider => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
          </select>
        </label>
        <label className={css.enabledFilter}><input type="checkbox" checked={enabledOnly}
          onChange={(event) => { setEnabledOnly(event.target.checked) }} />{text('仅显示已启用', 'Enabled only')}</label>
      </div>
      {feedback === null ? null : <p className={feedback.error ? css.error : undefined}
        role={feedback.error ? 'alert' : 'status'}>{providers.find(provider => provider.id === feedback.provider)?.name} · {feedback.message}</p>}
      <div className={css.tableWrap}>
        <table aria-label={text('生成模型', 'Generation models')}>
          <thead><tr>
            <th scope="col">{text('模型', 'Model')}</th>
            <th scope="col">{text('来源', 'Source')}</th>
            <th scope="col">{text('类型', 'Type')}</th>
            <th scope="col">{text('聊天选择器', 'In picker')}</th>
          </tr></thead>
          <tbody>
            {visible.map(({ model, provider, enabled, writable }) => <tr key={`${provider.id}/${modelKey(model)}`}>
              <th scope="row">
                <span>{model.name}</span>
                {model.id === model.name ? null : <small>{model.id}</small>}
                {model.unavailable === undefined ? null : <small>{unavailable[model.unavailable]}</small>}
              </th>
              <td><span className={css.source}>{provider.name}</span></td>
              <td>{mediaName(model.media)}</td>
              <td><input type="checkbox" checked={enabled} aria-label={text(
                `在选择器中使用 ${provider.name} ${model.name} ${mediaName(model.media)}`,
                `Use ${provider.name} ${model.name} in ${mediaName(model.media).toLowerCase()} picker`,
              )} disabled={!writable || pending !== null || (!enabled && model.unavailable !== undefined)}
              onChange={(event) => {
                const next = event.target.checked
                void run(provider.id, async () => { await provider.setEnabled(model, next) },
                  text('无法保存模型选择。请重试。', 'Could not save the model selection. Try again.'))
              }} /></td>
            </tr>)}
            {visible.length > 0 ? null : <tr><td colSpan={4} className={css.empty}>
              {rows.length === 0 && catalogs.size === 0
                ? text('配置提供商并加载模型。', 'Configure a provider and load its models.')
                : text('没有匹配的模型。', 'No matching models.')}
            </td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  </section>
}

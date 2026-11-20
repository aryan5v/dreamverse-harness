/** The Models settings contributions: default models, generation provider connections, and the generation model table. */
import { useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import {
  Button, IconChevronLeftOutlineRegular, IconChevronRightOutlineRegular, IconCloseOutlineRegular,
  IconLinkOutlineRegular, IconPlusOutlineRegular, IconRefreshOutlineRegular, IconSearchOutlineRegular, Input, Switch,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { CloudMedia, CloudModel, CloudModelSettings, CloudSelection } from '@dv/ui-kit/cloud-model-settings.ts'
import { useText } from '@dv/ui-kit/locale.ts'
import { createRegistry, type Registry } from '@dv/ui-kit/registries.ts'
import { CloudConnections, type AccountState, type SaveResult } from './cloud-connections.ts'
import { DefaultModels, type DefaultModelsProps } from './DefaultModels.tsx'
import css from './CloudModelsSettings.module.css'

const PAGE_SIZE = 12

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

/** The registered providers, sorted by name, with their live selection state. */
function useProviders(registry: Registry<CloudModelSettings>): readonly ProviderSnapshot[] {
  const registered = useSyncExternalStore(registry.subscribe, registry.getSnapshot)
  const providers = useMemo(() => [...registered].sort((a, b) => a.name.localeCompare(b.name)), [registered])
  const observable = useMemo(() => observeProviders(providers), [providers])
  return useSyncExternalStore(observable.subscribe, observable.getSnapshot)
}

function useMediaName(): (media: CloudMedia) => string {
  const text = useText()
  return media => ({ video: text('视频', 'Video'), image: text('图片', 'Image'), audio: text('音频', 'Audio') })[media]
}

const usd = (value: number): string => new Intl.NumberFormat(undefined, {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(value)

/** A provider's logo on a neutral tile. */
export function ProviderMark({ provider, size = 32 }: { provider: Pick<CloudModelSettings, 'logo'>; size?: number }) {
  const Logo = provider.logo
  return <span className={css.mark} style={{ width: size, height: size }}><Logo size={Math.round(size * 0.55)} /></span>
}

interface InjectedProps {
  providers: Registry<CloudModelSettings>
  connections: CloudConnections
}

/**
 * Mount the shared generation provider registry and the Models settings contributions.
 * @param ctx - the DreamVerse shell's browser context.
 */
export function applyCloudModelsSettings(ctx: Context): void {
  const providers = createRegistry<CloudModelSettings>(entry => [entry.id], entry => entry.name)
  const connections = new CloudConnections()
  ctx.effect(() => () => { connections.dispose() }, 'ui-shell: cloud connections')
  ctx.reflect.provide('dvCloudModels', providers)
  ctx.inject(['configForms', 'remote'], (scope) => {
    const defaults: DefaultModelsProps['source'] = {
      llmForm: scope.configForms.get<{ provider: string; model: string; reasoningEffort?: string }>('agent-default-model'),
      mediaForm: scope.configForms.get<{ defaults: Record<string, { provider: string; model: string }> }>('dv-models'),
      llmCatalog: async () => {
        const response = await scope.remote.session.modelCatalog()
        if (!response.ok) throw new Error(response.error.message)
        return response.value
      },
      mediaCatalog: async (signal) => {
        const response = await fetch('api/dv/models', { signal })
        if (!response.ok) throw new Error('Could not load the generation models.')
        return await response.json() as Awaited<ReturnType<DefaultModelsProps['source']['mediaCatalog']>>
      },
    }
    scope.effect(() => scope.slots.inject('settings.models.header', () => scope.slots.register({
      name: 'settings.models.header', id: 'dv-default-models', order: 0, inject: () => ({ source: defaults, providers }),
    }, DefaultModels)), 'ui-shell: default models')
  })
  ctx.effect(() => ctx.slots.inject('settings.models.header', () => ctx.slots.register({
    name: 'settings.models.header', id: 'dv-connections', order: 10, inject: () => ({ providers, connections }),
  }, Connections)), 'ui-shell: generation provider connections')
  ctx.effect(() => ctx.slots.inject('settings.models.footer', () => ctx.slots.register({
    name: 'settings.models.footer', id: 'dv-cloud-models', inject: () => ({ providers, connections }),
  }, ModelTable)), 'ui-shell: generation model table')
}

/** The status line of one connection row. */
function AccountLine({ account }: { account: AccountState | undefined }) {
  const text = useText()
  if (account === undefined || account.status === 'checking') {
    return <span className={css.statusLine}><span className={css.dot} data-tone="muted" />{text('检查中…', 'Checking…')}</span>
  }
  const line = {
    connected: [text('密钥已保存', 'Key saved'), 'positive'],
    missing: [text('未连接', 'Not connected'), 'muted'],
    rejected: [text('密钥被拒绝', 'Key rejected'), 'negative'],
    unavailable: [text('无法读取账户', 'Account unavailable'), 'warning'],
  }[account.status]
  return <span className={css.statusLine}>
    <span className={css.dot} data-tone={line[1]} />{line[0]}
    {account.status === 'connected' && account.label !== undefined ? <span className={css.statusDetail}>· {account.label}</span> : null}
  </span>
}

/**
 * The connected generation providers with their key state and remaining balance.
 * @param props - the provider registry and the shared account state.
 * @returns the connections section.
 */
export function Connections({ providers: registry, connections }: InjectedProps) {
  const text = useText()
  const mediaName = useMediaName()
  const providers = useProviders(registry)
  const { accounts } = useSyncExternalStore(connections.subscribe, connections.getSnapshot)
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const headingId = useId()
  useEffect(() => { connections.ensure(providers.map(({ provider }) => provider)) }, [connections, providers])
  if (providers.length === 0) return null
  const connected = providers.filter(({ provider }) => accounts.get(provider.id)?.status === 'connected')
  const listed = providers.filter(({ provider }) => accounts.get(provider.id)?.status !== 'missing')
  const unlisted = providers.filter(({ provider }) => accounts.get(provider.id)?.status === 'missing')
  const active = providers.find(({ provider }) => provider.id === open)
  return <section className={css.group} aria-labelledby={headingId}>
    <header className={css.groupHeading}>
      <h3 id={headingId}>{text('你的连接', 'Your connections')}</h3>
      <p>{text('生成视频、图片和音频的服务。密钥保存在 Harness 凭据存储中。', 'The services that generate your video, image, and audio. Keys stay in the harness credential store.')}</p>
    </header>
    <div className={css.card}>
      <div className={css.cardHead}>
        <span>{text(`${connected.length} 个已连接`, `${connected.length} connected`)}</span>
        <span className={css.headActions}>
          <button type="button" className={css.iconButton} aria-label={text('重新检查', 'Check again')}
            title={text('重新检查', 'Check again')}
            onClick={() => { for (const { provider } of providers) void connections.refresh(provider) }}>
            <IconRefreshOutlineRegular size={14} />
          </button>
          <button type="button" className={css.iconButton} aria-label={text('添加连接', 'Add a connection')}
            title={text('添加连接', 'Add a connection')} aria-expanded={adding} onClick={() => { setAdding(value => !value) }}>
            <IconPlusOutlineRegular size={14} />
          </button>
        </span>
      </div>
      {adding ? <div className={css.addGrid} role="group" aria-label={text('添加连接', 'Add a connection')}>
        {providers.map(({ provider }) => <button key={provider.id} type="button" className={css.addTile}
          onClick={() => { setAdding(false); setOpen(provider.id) }}>
          <ProviderMark provider={provider} />
          <span className={css.tileText}><strong>{provider.name}</strong><span>{provider.domain}</span></span>
          {accounts.get(provider.id)?.status === 'connected' ? <span className={css.tileNote}>{text('已连接', 'Connected')}</span> : null}
        </button>)}
      </div> : null}
      <ul className={css.rows}>
        {[...listed, ...unlisted].map(({ provider, state }) => {
          const account = accounts.get(provider.id)
          return <li key={provider.id}>
            <button type="button" className={css.row} aria-haspopup="dialog"
              aria-label={text(`管理 ${provider.name}`, `Manage ${provider.name}`)} onClick={() => { setOpen(provider.id) }}>
              <ProviderMark provider={provider} />
              <span className={css.rowText}>
                <strong>{provider.name}</strong>
                <AccountLine account={account} />
              </span>
              <span className={css.rowMeta}>
                <span className={css.metaLabel}>{text('类型', 'Serves')}</span>
                <span>{provider.media.map(mediaName).join(' · ')}</span>
              </span>
              <span className={css.rowMeta}>
                <span className={css.metaLabel}>{text('已启用', 'In picker')}</span>
                <span className={css.numeric}>{state.enabled.length}</span>
              </span>
              <span className={css.rowMeta} data-align="end">
                <span className={css.metaLabel}>{text('余额', 'Balance')}</span>
                <span className={css.numeric}>{account?.status === 'connected' && account.balanceUsd !== null ? usd(account.balanceUsd) : '—'}</span>
              </span>
              <IconChevronRightOutlineRegular size={14} className={css.chevron} />
            </button>
          </li>
        })}
      </ul>
    </div>
    {active === undefined ? null : <ConnectionSheet provider={active.provider} state={active.state} connections={connections}
      account={accounts.get(active.provider.id)} onClose={() => { setOpen(null) }} />}
  </section>
}

/** The side sheet that saves, replaces, and checks one provider's key. */
function ConnectionSheet({ provider, state, account, connections, onClose }: {
  provider: CloudModelSettings
  state: CloudSelection
  account: AccountState | undefined
  connections: CloudConnections
  onClose: () => void
}) {
  const text = useText()
  const mediaName = useMediaName()
  const { catalogs } = useSyncExternalStore(connections.subscribe, connections.getSnapshot)
  const catalog = catalogs.get(provider.id)
  const [key, setKey] = useState('')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<SaveResult | 'operator' | 'operatorFailed' | null>(null)
  const titleId = useId()
  const keyId = useId()
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey) }
  }, [onClose])
  const saved = account?.status === 'connected' || account?.status === 'rejected' || account?.status === 'unavailable'
  const save = async (): Promise<void> => {
    setPending(true)
    setResult(null)
    const outcome = await connections.save(provider, key.trim())
    setPending(false)
    setResult(outcome)
    if (outcome === 'saved') setKey('')
  }
  const enableOperator = async (): Promise<void> => {
    setPending(true)
    setResult(null)
    try {
      await provider.enableOperator?.(key.trim())
      setKey('')
      setResult('operator')
    } catch (_refused) {
      // The provider refused the key or the operator settings changed; the sheet reports it in place.
      setResult('operatorFailed')
    } finally { setPending(false) }
  }
  const counts = catalog?.status === 'ready'
    ? provider.media.map(media => [media, catalog.models.filter(model => model.media === media).length] as const)
    : []
  const message = result === null ? null : {
    saved: [text('密钥有效，模型已加载。', 'Key works. Models loaded.'), false],
    missing: [text('请先输入 API 密钥。', 'Enter an API key first.'), true],
    rejected: [text(`${provider.name} 拒绝了此密钥。请检查后重试。`, `${provider.name} rejected this key. Check it and try again.`), true],
    failed: [text('无法连接。请检查密钥和网络后重试。', 'Could not connect. Check the key and your network, then try again.'), true],
    operator: [text('现在可以在聊天中选择 OpenRouter LLM。', 'You can now pick OpenRouter LLMs in chat.'), false],
    operatorFailed: [text('无法启用聊天 LLM。请检查密钥。', 'Could not enable chat LLMs. Check the key.'), true],
  }[result]
  return createPortal(<div className={css.sheetRoot}>
    <div className={css.sheetMask} aria-hidden="true" onClick={onClose} />
    <form className={css.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId}
      onSubmit={(event) => { event.preventDefault(); void save() }}>
      <header className={css.sheetHead}>
        <ProviderMark provider={provider} size={28} />
        <h2 id={titleId}>{saved ? provider.name : text(`连接 ${provider.name}`, `Connect ${provider.name}`)}</h2>
        <button type="button" className={css.iconButton} aria-label={text('关闭', 'Close')} onClick={onClose}>
          <IconCloseOutlineRegular size={14} />
        </button>
      </header>
      <div className={css.sheetBody}>
        <section className={css.sheetCard}>
          <div className={css.keyState} data-tone={account?.status === 'connected' ? 'positive' : account?.status === 'rejected' ? 'negative' : 'muted'}>
            <AccountLine account={account} />
            {account?.status === 'connected' ? <span className={css.balance}>
              {account.balanceUsd === null ? text('余额不可用', 'Balance unavailable') : text(`剩余 ${usd(account.balanceUsd)}`, `${usd(account.balanceUsd)} left`)}
            </span> : null}
          </div>
          <label className={css.field} htmlFor={keyId}>
            <span>{saved ? text('替换 API 密钥', 'Replace API key') : text('API 密钥', 'API key')}</span>
          </label>
          <Input autoFocus id={keyId} type="password" autoComplete="new-password" value={key} disabled={pending || !state.writable}
            placeholder={saved ? text('已保存密钥 · 粘贴新密钥以替换', 'A key is saved · paste a new key to replace it')
              : text('粘贴你的 API 密钥', 'Paste your API key')}
            onChange={(event) => { setKey(event.target.value) }} />
          <p className={css.hint}>
            {text('密钥保存在 Harness 凭据存储中，不会写入配置文件。', 'The key goes to the harness credential store, never to a config file.')}{' '}
            <a href={provider.keyUrl} target="_blank" rel="noreferrer">
              {text(`从 ${provider.name} 获取密钥`, `Get a key from ${provider.name}`)}<IconLinkOutlineRegular size={12} />
            </a>
          </p>
          {message === null ? null : <p className={message[1] ? css.error : css.success} role={message[1] ? 'alert' : 'status'}>{message[0]}</p>}
        </section>
        <section className={css.sheetCard}>
          <h3>{text('模型', 'Models')}</h3>
          {catalog?.status === 'ready' ? <ul className={css.counts}>
            {counts.map(([media, count]) => <li key={media}>
              <span>{mediaName(media)}</span><span className={css.numeric}>{count}</span>
            </li>)}
            <li><span>{text('在选择器中', 'In the picker')}</span><span className={css.numeric}>{state.enabled.length}</span></li>
          </ul> : <p className={css.hint}>{catalog?.status === 'loading' ? text('正在加载模型…', 'Loading models…')
            : text('保存密钥后即可浏览模型。', 'Save a key to browse its models.')}</p>}
          {catalog?.status === 'ready' && catalog.warning !== undefined ? <p className={css.error} role="alert">{catalog.warning}</p> : null}
          {provider.enableOperator === undefined ? null : <Button type="button" variant="outline" disabled={pending || !state.writable}
            onClick={() => { void enableOperator() }}>{text('用于聊天 LLM', 'Use for chat LLMs')}</Button>}
        </section>
      </div>
      <footer className={css.sheetFoot}>
        <Button type="button" variant="outline" onClick={onClose}>{text('完成', 'Done')}</Button>
        <Button type="submit" variant="primary" disabled={pending || !state.writable || (key.trim() === '' && !saved)}>
          {pending ? text('检查中…', 'Checking…') : key.trim() === '' ? text('检查访问', 'Check access') : text('保存密钥', 'Save key')}
        </Button>
      </footer>
    </form>
  </div>, document.body)
}

/**
 * Every model of the connected providers, filterable and paged, with a switch that adds it to the composer picker.
 * @param props - the provider registry and the shared catalogs.
 * @returns the generation model table.
 */
export function ModelTable({ providers: registry, connections }: InjectedProps) {
  const text = useText()
  const mediaName = useMediaName()
  const providers = useProviders(registry)
  const { catalogs } = useSyncExternalStore(connections.subscribe, connections.getSnapshot)
  const [query, setQuery] = useState('')
  const [source, setSource] = useState('')
  const [media, setMedia] = useState<CloudMedia | ''>('')
  const [enabledOnly, setEnabledOnly] = useState(false)
  const [page, setPage] = useState(0)
  const [pending, setPending] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const headingId = useId()
  useEffect(() => { setPage(0) }, [query, source, media, enabledOnly])
  if (providers.length === 0) return null

  const rows = providers.flatMap(({ provider, state }) => {
    const catalog = catalogs.get(provider.id)
    const loaded = catalog?.status === 'ready' ? catalog.models : undefined
    const models = new Map(state.enabled.map(model => [modelKey(model), {
      model: loaded === undefined ? model : { ...model, unavailable: 'catalog' as const }, enabled: true,
    }]))
    const enabled = new Set(models.keys())
    for (const model of loaded ?? []) models.set(modelKey(model), { model, enabled: enabled.has(modelKey(model)) })
    return Array.from(models.values(), row => ({ ...row, provider, writable: state.writable }))
  })
  const needle = query.trim().toLowerCase()
  const visible = rows.filter(row => (source === '' || row.provider.id === source) && (media === '' || row.model.media === media)
    && (!enabledOnly || row.enabled) && `${row.model.name} ${row.model.id}`.toLowerCase().includes(needle))
    .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.model.name.localeCompare(b.model.name))
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const shown = visible.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)
  const loading = providers.some(({ provider }) => catalogs.get(provider.id)?.status === 'loading')
  const unavailable = {
    catalog: text('已从目录移除', 'Missing from catalog'),
    provider: text('提供商已禁用', 'Disabled by provider'),
    workflow: text('需要其他工作流', 'Needs another workflow'),
  }
  const mediaOptions = [...new Set(providers.flatMap(({ provider }) => provider.media))]

  return <section className={css.group} aria-labelledby={headingId}>
    <header className={css.groupHeading}>
      <h3 id={headingId}>{text('生成模型', 'Generation models')}</h3>
      <p>{text('开启的模型会出现在聊天的生成模型选择器中。', 'Models you turn on appear in the chat’s generation model picker.')}</p>
    </header>
    <div className={css.card}>
      <div className={css.toolbar}>
        <label className={css.search}>
          <IconSearchOutlineRegular size={14} />
          <span className={css.visuallyHidden}>{text('搜索模型', 'Search models')}</span>
          <input type="search" placeholder={text('搜索模型', 'Search models')} value={query}
            onChange={(event) => { setQuery(event.target.value) }} />
        </label>
        <div className={css.chips} role="group" aria-label={text('来源', 'Source')}>
          <button type="button" className={css.chip} aria-pressed={source === ''} onClick={() => { setSource('') }}>
            {text('全部', 'All')}
          </button>
          {providers.map(({ provider }) => <button key={provider.id} type="button" className={css.chip}
            aria-pressed={source === provider.id} onClick={() => { setSource(source === provider.id ? '' : provider.id) }}>
            <provider.logo size={12} />{provider.name}
          </button>)}
        </div>
        <div className={css.chips} role="group" aria-label={text('类型', 'Type')}>
          {mediaOptions.map(option => <button key={option} type="button" className={css.chip} aria-pressed={media === option}
            onClick={() => { setMedia(media === option ? '' : option) }}>{mediaName(option)}</button>)}
        </div>
        <span className={css.toolbarEnd}>
          <span aria-hidden="true">{text('仅已开启', 'On only')}</span>
          <Switch checked={enabledOnly} onChange={setEnabledOnly} label={text('仅显示已开启', 'On only')} />
        </span>
      </div>
      {failure === null ? null : <p className={css.tableAlert} role="alert">{failure}</p>}
      <table className={css.table} aria-label={text('生成模型', 'Generation models')}>
        <thead><tr>
          <th scope="col">{text('模型', 'Model')}</th>
          <th scope="col">{text('类型', 'Type')}</th>
          <th scope="col">{text('来源', 'Source')}</th>
          <th scope="col" className={css.switchCell}>{text('在选择器中', 'In picker')}</th>
        </tr></thead>
        <tbody>
          {shown.map(({ model, provider, enabled, writable }) => {
            const id = `${provider.id}/${modelKey(model)}`
            return <tr key={id} data-enabled={enabled}>
              <th scope="row">
                <span className={css.modelCell}>
                  <ProviderMark provider={provider} size={26} />
                  <span className={css.modelText}>
                    <span className={css.modelName}>{model.name}</span>
                    <span className={css.modelId}>{model.unavailable === undefined ? model.id : unavailable[model.unavailable]}</span>
                  </span>
                </span>
              </th>
              <td><span className={css.pill} data-media={model.media}>{mediaName(model.media)}</span></td>
              <td className={css.sourceCell}>{provider.name}</td>
              <td className={css.switchCell}>
                <Switch checked={enabled} label={text(`在选择器中使用 ${model.name}`, `Use ${model.name} in the picker`)}
                  disabled={!writable || pending !== null || (!enabled && model.unavailable !== undefined)}
                  onChange={(next) => {
                    setPending(id)
                    setFailure(null)
                    provider.setEnabled(model, next).catch((_refused: unknown) => {
                      setFailure(text('无法保存模型选择。请重试。', 'Could not save the model selection. Try again.'))
                    }).finally(() => { setPending(null) })
                  }} />
              </td>
            </tr>
          })}
          {shown.length > 0 ? null : <tr><td colSpan={4} className={css.empty}>
            {loading ? text('正在加载模型…', 'Loading models…')
              : rows.length === 0 ? text('连接上方的服务即可浏览其模型。', 'Connect a service above to browse its models.')
                : text('没有匹配的模型。', 'No models match these filters.')}
          </td></tr>}
        </tbody>
      </table>
      <footer className={css.pager}>
        <span className={css.numeric}>{visible.length === 0 ? text('0 个模型', '0 models')
          : text(`第 ${current * PAGE_SIZE + 1}–${current * PAGE_SIZE + shown.length} 个，共 ${visible.length} 个`,
            `${current * PAGE_SIZE + 1}–${current * PAGE_SIZE + shown.length} of ${visible.length}`)}</span>
        <span className={css.pagerButtons}>
          <button type="button" className={css.iconButton} aria-label={text('上一页', 'Previous page')} disabled={current === 0}
            onClick={() => { setPage(current - 1) }}><IconChevronLeftOutlineRegular size={14} /></button>
          <span className={css.numeric}>{text(`${current + 1} / ${pages}`, `${current + 1} / ${pages}`)}</span>
          <button type="button" className={css.iconButton} aria-label={text('下一页', 'Next page')} disabled={current >= pages - 1}
            onClick={() => { setPage(current + 1) }}><IconChevronRightOutlineRegular size={14} /></button>
        </span>
      </footer>
    </div>
  </section>
}

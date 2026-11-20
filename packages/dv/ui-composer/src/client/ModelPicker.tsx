/** Conversation-level model choices, one per generation modality, beside the operator LLM in the chat composer. */
import { useCallback, useEffect, useState, useSyncExternalStore, type ComponentType, type ReactNode } from 'react'
import { IconBrowseOutlineRegular, IconChevronDownOutlineRegular, IconMicrophoneOutlineRegular, IconPlayOutlineRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { errorMessage } from '@dv/ui-kit/api.ts'
import { useText } from '@dv/ui-kit/locale.ts'
import type { WireModelEntry, WireState } from '@dv/ui-kit/types.ts'
import { PickerPopover } from './PickerPopover.tsx'

interface Selection { provider: string; model: string }

/** The menu row id of a provider and model. */
const choiceId = (choice: Selection): string => JSON.stringify([choice.provider, choice.model])

const providerNames: Record<string, string> = {
  reactor: 'Reactor',
  openrouter: 'OpenRouter',
  fastvideo: 'FastVideo',
  uniserve: 'UniServe',
}

/** The modalities the composer offers a choice for, in the order their pickers show. */
export const PICKER_MODALITIES = ['video', 'image', 'audio'] as const

/** One modality the composer offers a choice for. */
export type PickerModality = typeof PICKER_MODALITIES[number]

const modalityIcons = {
  video: IconPlayOutlineRegular,
  image: IconBrowseOutlineRegular,
  audio: IconMicrophoneOutlineRegular,
}

/**
 * The menu rows of one modality: one row per model, even when a model serves several generation tasks, without models
 * whose weights are not installed.
 * @param models - the model catalog.
 * @param modality - the modality of the picker.
 * @returns one entry per provider and model.
 */
export function modelChoices(models: readonly WireModelEntry[], modality: PickerModality): WireModelEntry[] {
  return [...new Map(models.filter(entry => entry.modality === modality && entry.runtime?.installed !== false)
    .map(entry => [choiceId(entry), entry])).values()]
}

/**
 * The modalities that get a picker: video always, and image and audio while the catalog holds a model of theirs.
 * @param models - the model catalog.
 * @returns the modalities, in picker order.
 */
export function pickerModalities(models: readonly WireModelEntry[]): PickerModality[] {
  return PICKER_MODALITIES.filter(modality => modality === 'video' || modelChoices(models, modality).length > 0)
}

/** Narrow the optional component slice owned by the model controls. */
function selectedModel(state: WireState | null, session: string, modality: PickerModality): Selection | null {
  const slice = state?.components['models'] as { conversations?: Record<string, Partial<Record<string, Selection>>> } | undefined
  return slice?.conversations?.[session]?.[modality] ?? null
}

export interface ModelPickerProps {
  sessionId: string
  modality: PickerModality
  state: HostObservable<WireState | null>
  models: HostObservable<readonly WireModelEntry[] | null>
  /** Load the catalog again; the picker calls it each time the user opens the menu. */
  reloadModels: () => void
  save(selection: Selection | null): Promise<unknown>
}

/** Save a conversation default of one modality without changing the draft or any previous generation. */
export function ModelPicker({ sessionId, modality, state, models, reloadModels, save }: ModelPickerProps) {
  const pick = useText()
  const project = useSyncExternalStore(state.subscribe, state.getSnapshot)
  const catalog = useSyncExternalStore(models.subscribe, models.getSnapshot)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  useEffect(() => { setOpen(false); setFailure(null) }, [state, sessionId])
  const kind = ({
    video: { short: pick('视频', 'Video'), long: pick('视频模型', 'Video model'), kept: pick('已生成的视频不变。', 'Existing videos keep their model.') },
    image: { short: pick('图片', 'Image'), long: pick('图片模型', 'Image model'), kept: pick('已生成的图片不变。', 'Existing images keep their model.') },
    audio: { short: pick('音频', 'Audio'), long: pick('音频模型', 'Audio model'), kept: pick('已生成的音频不变。', 'Existing audio keeps its model.') },
  } as const)[modality]
  const choices = modelChoices(catalog ?? [], modality)
  const selected = selectedModel(project, sessionId, modality)
  const selectedId = selected === null ? '' : choiceId(selected)
  const entry = choices.find(choice => choiceId(choice) === selectedId)
  const modelLabel = (choice: WireModelEntry): string => {
    const name = choice.display_name ?? choice.model
    if (choice.hosting === undefined) return name
    const hosting = choice.hosting === 'managed' ? pick('云端', 'Cloud') : pick('自托管', 'Self-hosted')
    return `${name} · ${providerNames[choice.provider] ?? choice.provider} · ${hosting}`
  }
  const label = selected === null ? pick('自动', 'Auto') : entry === undefined ? selected.model : modelLabel(entry)
  const choose = (id: string): void => {
    const next = choices.find(choice => choiceId(choice) === id)
    if (id !== '' && next === undefined) return
    setOpen(false)
    setSaving(true)
    setFailure(null)
    save(next === undefined ? null : { provider: next.provider, model: next.model })
      .catch((error: unknown) => { setFailure(errorMessage(error)) })
      .finally(() => { setSaving(false) })
  }
  return <span className="dv-model-choice">
    <Menu open={open} onClose={() => { setOpen(false) }} onSelect={choose} selectedId={selectedId}
      portal side="top" compact autoFocus items={[
        { id: '', label: pick('自动 · 由智能体选择', 'Auto · let the operator choose') },
        ...choices.map(choice => ({ id: choiceId(choice),
          label: modelLabel(choice) })),
      ]} anchor={<button type="button" className="dv-model-choice-trigger" aria-haspopup="menu" aria-expanded={open}
        aria-label={`${kind.long}${pick('：', ': ')}${label}`}
        title={`${pick('后续生成使用此模型，需要时加载；', 'Used for future generations; loads when needed. ')}${kind.kept}`}
        disabled={saving || project === null}
        onClick={() => { if (!open) reloadModels(); setOpen(value => !value) }}>
        <span className="dv-model-choice-kind">{kind.short}</span>
        <span className="dv-model-choice-name">{saving ? pick('保存中…', 'Saving…') : label}</span>
        <IconChevronDownOutlineRegular size={14} />
      </button>} />
    {failure === null ? null : <span role="alert" className="dv-model-choice-error">{failure}</span>}
  </span>
}

export interface ModelPickersProps extends Omit<ModelPickerProps, 'modality' | 'save'> {
  save: (modality: PickerModality, selection: Selection | null) => Promise<unknown>
  /** The Settings defaults a conversation starts on, shown while the conversation has no choice of its own. */
  defaults?: Readonly<Partial<Record<PickerModality, Selection>>>
  /** The logo of a provider, when its plugin draws one. */
  logoOf?: (provider: string) => ComponentType<{ size: number }> | undefined
}

/** The row id of one modality's model. */
const rowOf = (modality: PickerModality, choice: Selection): string => JSON.stringify([modality, choice.provider, choice.model])

/**
 * One popover for every generation media type: models grouped by provider, media filters, and a detail card. Choosing a
 * model makes it the conversation's choice of its media type; choosing the current choice again returns that type to
 * Auto. Models whose backend does not answer (`schema` null) are not listed.
 */
export function ModelPickers({ sessionId, state, models, reloadModels, save, logoOf, defaults = {} }: ModelPickersProps) {
  const pick = useText()
  const project = useSyncExternalStore(useCallback((listener: () => void) => state.subscribe(listener), [state]),
    useCallback(() => state.getSnapshot(), [state]))
  const catalog = useSyncExternalStore(useCallback((listener: () => void) => models.subscribe(listener), [models]),
    useCallback(() => models.getSnapshot(), [models]))
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  useEffect(() => { setFailure(null) }, [state, sessionId])
  const kind = (modality: PickerModality): string =>
    ({ video: pick('视频', 'Video'), image: pick('图片', 'Image'), audio: pick('音频', 'Audio') })[modality]
  const reachable = (catalog ?? []).filter(entry => entry.schema !== null)
  const choices = PICKER_MODALITIES.flatMap(modality => modelChoices(reachable, modality).map(entry => ({ modality, entry })))
  const selected = new Map(PICKER_MODALITIES.flatMap((modality) => {
    // A conversation without a choice of its own shows the Settings default it would start on.
    const choice = selectedModel(project, sessionId, modality) ?? defaults[modality] ?? null
    return choice === null ? [] : [[modality, choice] as const]
  }))
  const providerIds = [...new Set(choices.map(({ entry }) => entry.provider))]
  const glyph = (provider: string): ReactNode => {
    const Logo = logoOf?.(provider)
    return <span className="dv-provider-glyph" aria-hidden="true">{Logo === undefined ? (providerNames[provider] ?? provider).slice(0, 1).toUpperCase() : <Logo size={12} />}</span>
  }
  const nameOf = (entry: Selection): string =>
    choices.find(({ entry: choice }) => choice.provider === entry.provider && choice.model === entry.model)
      ?.entry.display_name ?? entry.model
  const status = (entry: WireModelEntry): string => entry.runtime == null ? pick('可用', 'Available')
    : entry.runtime.busy ? pick('生成中', 'Generating') : entry.runtime.loading ? pick('加载中', 'Loading')
      : entry.runtime.loaded ? pick('已加载', 'Loaded') : pick('已安装', 'Installed')
  const items = choices.map(({ modality, entry }) => {
    const tasks = (catalog ?? [])
      .filter(other => other.modality === modality && other.provider === entry.provider && other.model === entry.model)
      .map(other => other.task.toUpperCase())
    const current = selected.get(modality)
    return {
      id: rowOf(modality, entry), group: entry.provider, filter: modality, label: entry.display_name ?? entry.model, tag: kind(modality),
      selected: current !== undefined && current.provider === entry.provider && current.model === entry.model,
      facts: [
        [pick('提供商', 'Provider'), providerNames[entry.provider] ?? entry.provider],
        [pick('类型', 'Type'), kind(modality)],
        ...entry.hosting === undefined ? [] : [[pick('托管', 'Hosting'), entry.hosting === 'managed' ? pick('云端', 'Cloud') : pick('自托管', 'Self-hosted')] as const],
        [pick('任务', 'Tasks'), [...new Set(tasks)].join(' · ')],
        [pick('状态', 'Status'), status(entry)],
      ] as const,
    }
  })
  const chosen = [...selected.values()]
  const first = chosen[0]
  const value = saving ? pick('保存中…', 'Saving…') : first === undefined ? pick('自动', 'Auto')
    : chosen.length === 1 ? nameOf(first) : `${nameOf(first)} +${chosen.length - 1}`
  const choose = (id: string): boolean => {
    const target = choices.find(({ modality, entry }) => rowOf(modality, entry) === id)
    const writes: (readonly [PickerModality, Selection | null])[] = []
    if (id === 'auto') {
      for (const modality of selected.keys()) writes.push([modality, null])
    } else if (target !== undefined) {
      const { modality, entry: { provider, model } } = target
      const current = selected.get(modality)
      writes.push([modality, current?.provider === provider && current.model === model ? null : { provider, model }])
    }
    if (writes.length === 0) return true
    setSaving(true)
    setFailure(null)
    Promise.all(writes.map(([modality, selection]) => save(modality, selection)))
      .catch((error: unknown) => { setFailure(errorMessage(error)) })
      .finally(() => { setSaving(false) })
    return true
  }
  return <span className="dv-model-choice">
    <PickerPopover label={pick('生成模型', 'Generation model')} value={value} disabled={saving}
      valueIcon={chosen[0] === undefined ? undefined : glyph(chosen[0].provider)}
      searchLabel={pick('搜索模型', 'Search models')} emptyLabel={pick('没有匹配的模型。', 'No models match.')}
      onOpen={reloadModels} onSelect={choose}
      filters={(['video', 'audio', 'image'] as const).map((modality) => {
        const Icon = modalityIcons[modality]
        return { id: modality, name: kind(modality), icon: <Icon size={16} /> }
      })}
      leading={[{ id: 'auto', group: '', label: pick('自动 · 由导演选择', 'Auto · the director chooses'), selected: chosen.length === 0,
        facts: [[pick('说明', 'About'), pick('导演为每个镜头选择模型。', 'The director picks a model for each shot.')]] }]}
      groups={providerIds.map(provider => ({ id: provider, name: providerNames[provider] ?? provider, icon: glyph(provider) }))}
      items={items}
      footer={pick('在 设置 → 模型 中添加更多模型。', 'Add more models in Settings → Models.')} />
    {failure === null ? null : <span role="alert" className="dv-model-choice-error">{failure}</span>}
  </span>
}

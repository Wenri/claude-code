import chalk from 'chalk'
import type { AppState } from '../../state/AppStateStore.js'
import { errorMessage } from '../../utils/errors.js'
import { isBilledAsExtraUsage } from '../../utils/extraUsage.js'
import {
  clearFastModeCooldown,
  isFastModeEnabled,
  isFastModeSupportedByModel,
} from '../../utils/fastMode.js'
import { MODEL_ALIASES } from '../../utils/model/aliases.js'
import {
  checkOpus1mAccess,
  checkSonnet1mAccess,
} from '../../utils/model/check1mAccess.js'
import {
  getDefaultMainLoopModelSetting,
  isOpus1mMergeEnabled,
  renderDefaultModelSetting,
} from '../../utils/model/model.js'
import { isModelAllowed } from '../../utils/model/modelAllowlist.js'
import { validateModel } from '../../utils/model/validateModel.js'

type GetAppState = () => AppState
type SetAppState = (updater: (previous: AppState) => AppState) => void

export type ModelCommandResult = {
  ok: boolean
  message: string
}

export async function executeModelChange(
  argument: string,
  getAppState: GetAppState,
  setAppState: SetAppState,
): Promise<ModelCommandResult> {
  const model = argument === 'default' ? null : argument
  if (model && !isModelAllowed(model)) {
    return {
      ok: false,
      message: `Model '${model}' is not available. Your organization restricts model selection.`,
    }
  }
  if (model && isOpus1mUnavailable(model)) {
    return {
      ok: false,
      message:
        'Opus with 1M context is not available for your account. Learn more: https://code.claude.com/docs/en/model-config#extended-context-with-1m',
    }
  }
  if (model && isSonnet1mUnavailable(model)) {
    return {
      ok: false,
      message:
        'Sonnet 4.6 with 1M context is not available for your account. Learn more: https://code.claude.com/docs/en/model-config#extended-context-with-1m',
    }
  }
  if (!model || isKnownAlias(model)) {
    return { ok: true, message: applyModel(model, getAppState, setAppState) }
  }

  try {
    const validation = await validateModel(model)
    if (!validation.valid) {
      return { ok: false, message: validation.error! }
    }
    return { ok: true, message: applyModel(model, getAppState, setAppState) }
  } catch (error) {
    return {
      ok: false,
      message: `Failed to validate model: ${errorMessage(error)}`,
    }
  }
}

function applyModel(
  model: string | null,
  getAppState: GetAppState,
  setAppState: SetAppState,
): string {
  const isFastMode = getAppState().fastMode
  setAppState(previous => ({
    ...previous,
    mainLoopModel: model,
    mainLoopModelForSession: null,
  }))
  let message = `Set model to ${chalk.bold(renderModelLabel(model))}`
  let wasFastModeToggledOn: boolean | undefined
  if (isFastModeEnabled()) {
    clearFastModeCooldown()
    if (!isFastModeSupportedByModel(model) && isFastMode) {
      setAppState(previous => ({ ...previous, fastMode: false }))
      wasFastModeToggledOn = false
    } else if (isFastModeSupportedByModel(model) && isFastMode) {
      message += ' · Fast mode ON'
      wasFastModeToggledOn = true
    }
  }
  if (
    isBilledAsExtraUsage(
      model,
      wasFastModeToggledOn === true,
      isOpus1mMergeEnabled(),
    )
  ) {
    message += ' · Billed as extra usage'
  }
  if (wasFastModeToggledOn === false) {
    message += ' · Fast mode OFF'
  }
  return message
}

function isKnownAlias(model: string): boolean {
  return (MODEL_ALIASES as readonly string[]).includes(
    model.toLowerCase().trim(),
  )
}

function isOpus1mUnavailable(model: string): boolean {
  const normalized = model.toLowerCase()
  return (
    !checkOpus1mAccess() &&
    !isOpus1mMergeEnabled() &&
    normalized.includes('opus') &&
    normalized.includes('[1m]')
  )
}

function isSonnet1mUnavailable(model: string): boolean {
  const normalized = model.toLowerCase()
  return (
    !checkSonnet1mAccess() &&
    (normalized.includes('sonnet[1m]') ||
      normalized.includes('sonnet-4-6[1m]'))
  )
}

export function renderModelLabel(model: string | null): string {
  const rendered = renderDefaultModelSetting(
    model ?? getDefaultMainLoopModelSetting(),
  )
  return model === null ? `${rendered} (default)` : rendered
}

type CurrentModelState = Pick<
  AppState,
  'mainLoopModel' | 'mainLoopModelForSession' | 'effortValue'
>

export function renderCurrentModel(
  state: CurrentModelState,
  format = (value: string): string => value,
): string {
  const baseModel = renderModelLabel(state.mainLoopModel)
  const effort =
    state.effortValue !== undefined ? ` (effort: ${state.effortValue})` : ''
  if (state.mainLoopModelForSession) {
    return `Current model: ${format(renderModelLabel(state.mainLoopModelForSession))} (session override from plan mode)\nBase model: ${baseModel}${effort}`
  }
  return `Current model: ${baseModel}${effort}`
}

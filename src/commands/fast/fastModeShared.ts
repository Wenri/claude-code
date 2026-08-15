import { getFastIconString } from '../../components/FastIcon.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import type { AppState } from '../../state/AppState.js'
import {
  clearFastModeCooldown,
  FAST_MODE_MODEL_DISPLAY,
  getFastModeModel,
  getFastModeUnavailableReason,
  isFastModeSupportedByModel,
} from '../../utils/fastMode.js'
import {
  formatModelPricing,
  getOpus46CostTier,
} from '../../utils/modelCost.js'
import { updateSettingsForSource } from '../../utils/settings/settings.js'

type SetAppState = (f: (prev: AppState) => AppState) => void
type FastModeToggleSource = 'shortcut' | 'bridge'

export function applyFastMode(
  enable: boolean,
  setAppState: SetAppState,
): void {
  clearFastModeCooldown()
  updateSettingsForSource('userSettings', {
    fastMode: enable ? true : undefined,
  })
  if (enable) {
    setAppState(prev => {
      const needsModelSwitch = !isFastModeSupportedByModel(prev.mainLoopModel)
      return {
        ...prev,
        ...(needsModelSwitch
          ? {
              mainLoopModel: getFastModeModel(),
              mainLoopModelForSession: null,
            }
          : {}),
        fastMode: true,
      }
    })
  } else {
    setAppState(prev => ({
      ...prev,
      fastMode: false,
    }))
  }
}

export async function handleFastModeShortcut(
  enable: boolean,
  getAppState: () => AppState,
  setAppState: SetAppState,
  source: FastModeToggleSource,
): Promise<string> {
  const unavailableReason = getFastModeUnavailableReason()
  if (unavailableReason) {
    return `Fast mode unavailable: ${unavailableReason}`
  }

  const { mainLoopModel } = getAppState()
  applyFastMode(enable, setAppState)
  logEvent('tengu_fast_mode_toggled', {
    enabled: enable,
    source:
      source as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  if (enable) {
    const fastIcon = getFastIconString(true)
    const modelUpdated = !isFastModeSupportedByModel(mainLoopModel)
      ? ` · model set to ${FAST_MODE_MODEL_DISPLAY}`
      : ''
    const pricing = formatModelPricing(getOpus46CostTier(true))
    return `${fastIcon} Fast mode ON${modelUpdated} · ${pricing}`
  }
  return 'Fast mode OFF'
}

import * as React from 'react'
import type { Command } from '../commands.js'
import { Select } from '../components/CustomSelect/index.js'
import { Dialog } from '../components/design-system/Dialog.js'
import { useMainLoopModel } from '../hooks/useMainLoopModel.js'
import { Box, Text } from '../ink.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'
import { useAppState, useSetAppState } from '../state/AppState.js'
import type {
  LocalJSXCommandCall,
  LocalJSXCommandOnDone,
} from '../types/command.js'
import {
  canUserConfigureAdvisor,
  isValidAdvisorModel,
  modelSupportsAdvisor,
} from '../utils/advisor.js'
import {
  normalizeModelStringForAPI,
  parseUserSpecifiedModel,
  renderDefaultModelSetting,
} from '../utils/model/model.js'
import { validateModel } from '../utils/model/validateModel.js'
import { updateSettingsForSource } from '../utils/settings/settings.js'

const ADVISOR_MODEL_CHOICES = ['opus', 'sonnet'] as const

function applyAdvisorChoice(
  choice: string,
  mainModel: string,
  setAppState: ReturnType<typeof useSetAppState>,
): string {
  logEvent('tengu_advisor_command', {
    advisor:
      choice as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })
  if (choice === 'off') {
    setAppState(state =>
      state.advisorModel === undefined
        ? state
        : { ...state, advisorModel: undefined },
    )
    updateSettingsForSource('userSettings', { advisorModel: undefined })
    return 'Advisor disabled'
  }

  const normalized = normalizeModelStringForAPI(choice)
  setAppState(state =>
    state.advisorModel === normalized
      ? state
      : { ...state, advisorModel: normalized },
  )
  updateSettingsForSource('userSettings', { advisorModel: normalized })

  let message = `Advisor set to ${renderDefaultModelSetting(normalized)}`
  if (!modelSupportsAdvisor(mainModel)) {
    message += `\nNote: the current main model (${renderDefaultModelSetting(mainModel)}) does not support the advisor. It will activate when you switch to a supported main model.`
  }
  return message
}

function advisorAlias(value: string): (typeof ADVISOR_MODEL_CHOICES)[number] | undefined {
  const normalized = value.toLowerCase()
  return ADVISOR_MODEL_CHOICES.find(alias => normalized.includes(alias))
}

function ApplyAdvisorChoice({
  choice,
  onDone,
}: {
  choice: string
  onDone: LocalJSXCommandOnDone
}): React.ReactNode {
  const setAppState = useSetAppState()
  const mainModel = useMainLoopModel()
  const currentMainModel = React.useRef(mainModel)
  const applied = React.useRef(false)
  currentMainModel.current = mainModel

  React.useEffect(() => {
    if (applied.current) return
    applied.current = true
    const timer = setTimeout(() => {
      onDone(applyAdvisorChoice(choice, currentMainModel.current, setAppState))
    }, 0)
    return () => clearTimeout(timer)
  }, [choice, onDone, setAppState])
  return null
}

function AdvisorDialog({
  onDone,
}: {
  onDone: LocalJSXCommandOnDone
}): React.ReactNode {
  const configured = useAppState(state => state.advisorModel)
  const mainModel = useMainLoopModel()
  const setAppState = useSetAppState()
  const knownAlias = configured ? advisorAlias(configured) : undefined
  const customOption =
    configured && !knownAlias
      ? { label: renderDefaultModelSetting(configured), value: configured }
      : undefined
  const options = [
    ...ADVISOR_MODEL_CHOICES.map(value => ({
      label: renderDefaultModelSetting(value),
      value,
    })),
    ...(customOption ? [customOption] : []),
    { label: 'No advisor', value: 'off' },
  ]
  const selected = customOption?.value ?? knownAlias ?? 'off'

  React.useEffect(() => {
    logEvent('tengu_advisor_dialog_shown', {})
  }, [])

  const cancel = (): void => onDone(undefined, { display: 'skip' })
  return (
    <Dialog title="Advisor Tool" onCancel={cancel}>
      <Box flexDirection="column" gap={1}>
        <Text>
          When Claude needs stronger judgment — a complex decision, an
          ambiguous failure, a problem it's circling without progress — it
          escalates to the advisor model for guidance, then resumes. The advisor
          runs server-side and uses additional tokens.
        </Text>
        <Text>
          For certain workloads, pairing Sonnet as the main model with Opus as
          the advisor gives you near-Opus performance with reduced token usage.
        </Text>
        {!modelSupportsAdvisor(mainModel) && (
          <Text color="warning">
            The current main model ({renderDefaultModelSetting(mainModel)}) does not
            support the advisor.
          </Text>
        )}
        <Select
          options={options}
          defaultValue={selected}
          defaultFocusValue={selected}
          onChange={choice =>
            onDone(applyAdvisorChoice(choice, mainModel, setAppState))
          }
          onCancel={cancel}
        />
      </Box>
    </Dialog>
  )
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const choice = args.trim().toLowerCase()
  if (!choice) return <AdvisorDialog onDone={onDone} />
  if (choice === 'off' || choice === 'unset') {
    return <ApplyAdvisorChoice choice="off" onDone={onDone} />
  }

  const resolved = parseUserSpecifiedModel(choice)
  const validation = await validateModel(resolved)
  if (!validation.valid) {
    onDone(`Invalid advisor model: ${validation.error}`)
    return null
  }
  if (!isValidAdvisorModel(resolved)) {
    onDone(
      `${choice} cannot be used as an advisor. Valid options: ${ADVISOR_MODEL_CHOICES.join(', ')}, off`,
    )
    return null
  }
  return <ApplyAdvisorChoice choice={choice} onDone={onDone} />
}

export default {
  type: 'local-jsx',
  name: 'advisor',
  description:
    'Configure the Advisor Tool to consult a stronger model for guidance at key moments during a task',
  argumentHint: `[${[...ADVISOR_MODEL_CHOICES, 'off'].join('|')}]`,
  isEnabled: () => canUserConfigureAdvisor(),
  get isHidden() {
    return !canUserConfigureAdvisor()
  },
  load: () => Promise.resolve({ call }),
} satisfies Command

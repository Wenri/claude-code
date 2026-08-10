import * as React from 'react'
import { Select } from '../../components/CustomSelect/index.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js'
import { Box, Link, Text } from '../../ink.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import { useAppState, useSetAppState } from '../../state/AppState.js'
import type {
  LocalJSXCommandCall,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import {
  ADVISOR_MODEL_OPTIONS,
  isValidAdvisorModel,
  modelSupportsAdvisor,
} from '../../utils/advisor.js'
import {
  normalizeModelStringForAPI,
  parseUserSpecifiedModel,
  renderModelName,
} from '../../utils/model/model.js'
import { validateModel } from '../../utils/model/validateModel.js'
import { updateSettingsForSource } from '../../utils/settings/settings.js'

const ADVISOR_STRATEGY_URL = 'https://claude.com/blog/the-advisor-strategy'

function renderAdvisorModel(model: string): string {
  return renderModelName(parseUserSpecifiedModel(model))
}

export function applyAdvisorSelection(
  choice: string,
  mainLoopModel: string,
  setAppState: ReturnType<typeof useSetAppState>,
): string {
  logEvent('tengu_advisor_command', {
    advisor:
      choice as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })
  if (choice === 'off') {
    setAppState(previous =>
      previous.advisorModel === undefined
        ? previous
        : { ...previous, advisorModel: undefined },
    )
    updateSettingsForSource('userSettings', { advisorModel: undefined })
    return 'Advisor disabled'
  }

  const advisorModel = normalizeModelStringForAPI(choice)
  setAppState(previous =>
    previous.advisorModel === advisorModel
      ? previous
      : { ...previous, advisorModel },
  )
  updateSettingsForSource('userSettings', { advisorModel })
  let message = `Advisor set to ${renderAdvisorModel(advisorModel)}`
  if (!modelSupportsAdvisor(mainLoopModel)) {
    message += `\nNote: the current main model (${renderAdvisorModel(mainLoopModel)}) does not support the advisor. It will activate when you switch to a supported main model.`
  }
  return message
}

function AdvisorDialog({
  onDone,
}: {
  onDone: LocalJSXCommandOnDone
}): React.ReactNode {
  const currentAdvisorModel = useAppState(state => state.advisorModel)
  const mainLoopModel = useMainLoopModel()
  const setAppState = useSetAppState()
  const knownCurrent = currentAdvisorModel
    ? ADVISOR_MODEL_OPTIONS.find(option =>
        currentAdvisorModel.toLowerCase().includes(option),
      )
    : undefined
  const customOption =
    currentAdvisorModel && !knownCurrent
      ? {
          label: renderAdvisorModel(currentAdvisorModel),
          value: currentAdvisorModel,
        }
      : undefined
  const options = [
    ...ADVISOR_MODEL_OPTIONS.map(model => ({
      label: renderAdvisorModel(model),
      value: model,
    })),
    ...(customOption ? [customOption] : []),
    { label: 'No advisor', value: 'off' },
  ]
  const selected = customOption?.value ?? knownCurrent ?? 'off'

  React.useEffect(() => {
    logEvent('tengu_advisor_dialog_shown', {})
  }, [])

  const cancel = () => onDone(undefined, { display: 'skip' })
  return (
    <Dialog title="Advisor Tool (Experimental)" onCancel={cancel}>
      <Box flexDirection="column" gap={1}>
        <Text>
          When Claude needs stronger judgment — a complex decision, an
          ambiguous failure, a problem it's circling without progress — it
          escalates to the advisor model for guidance, then resumes. The advisor
          runs server-side and uses additional tokens.
        </Text>
        {!modelSupportsAdvisor(mainLoopModel) && (
          <Text color="warning">
            The current main model ({renderAdvisorModel(mainLoopModel)}) does not
            support the advisor.
          </Text>
        )}
        <Select
          options={options}
          defaultValue={selected}
          defaultFocusValue={selected}
          onChange={choice =>
            onDone(applyAdvisorSelection(choice, mainLoopModel, setAppState))
          }
          onCancel={cancel}
        />
        <Text>
          <Text color="suggestion">Recommended setup: </Text>
          <Text>
            Sonnet as the main model with Opus as the advisor. For certain
            workloads this gives near-Opus performance with reduced token
            usage.
          </Text>
        </Text>
        <Link url={ADVISOR_STRATEGY_URL} />
      </Box>
    </Dialog>
  )
}

function ApplyAdvisorSelection({
  choice,
  onDone,
}: {
  choice: string
  onDone: LocalJSXCommandOnDone
}): React.ReactNode {
  const setAppState = useSetAppState()
  const mainLoopModel = useMainLoopModel()
  const mainLoopModelRef = React.useRef(mainLoopModel)
  mainLoopModelRef.current = mainLoopModel
  const appliedRef = React.useRef(false)
  React.useEffect(() => {
    if (appliedRef.current) return
    appliedRef.current = true
    const timeout = setTimeout(() => {
      onDone(
        applyAdvisorSelection(
          choice,
          mainLoopModelRef.current,
          setAppState,
        ),
      )
    }, 0)
    return () => clearTimeout(timeout)
  }, [choice, onDone, setAppState])
  return null
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const choice = args.trim().toLowerCase()
  if (!choice) return <AdvisorDialog onDone={onDone} />
  if (choice === 'off' || choice === 'unset') {
    return <ApplyAdvisorSelection choice="off" onDone={onDone} />
  }

  const resolvedModel = parseUserSpecifiedModel(choice)
  const validation = await validateModel(resolvedModel)
  if (!validation.valid) {
    onDone(`Invalid advisor model: ${validation.error}`)
    return null
  }
  if (!isValidAdvisorModel(resolvedModel)) {
    onDone(
      `${choice} cannot be used as an advisor. Valid options: ${ADVISOR_MODEL_OPTIONS.join(', ')}, off`,
    )
    return null
  }
  return <ApplyAdvisorSelection choice={choice} onDone={onDone} />
}

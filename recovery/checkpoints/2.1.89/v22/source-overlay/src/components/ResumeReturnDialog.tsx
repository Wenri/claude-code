import { c as _c } from 'react/compiler-runtime'
import React from 'react'
import { Box, Text } from '../ink.js'
import { formatTokens } from '../utils/format.js'
import { Select } from './CustomSelect/index.js'
import { Dialog } from './design-system/Dialog.js'

export type ResumeReturnAction =
  | 'continue'
  | 'compact'
  | 'dismiss'
  | 'never'

type Props = {
  sessionAgeMinutes: number
  estimatedTokens: number
  onDone: (action: ResumeReturnAction) => void
}

export function ResumeReturnDialog(props: Props): React.ReactNode {
  const cache = _c(16)
  const { sessionAgeMinutes, estimatedTokens, onDone } = props
  let ageResult
  if (cache[0] !== sessionAgeMinutes) {
    ageResult = formatSessionAge(sessionAgeMinutes)
    cache[0] = sessionAgeMinutes
    cache[1] = ageResult
  } else {
    ageResult = cache[1]
  }
  const formattedAge = ageResult
  let formattedTokens
  if (cache[2] !== estimatedTokens) {
    formattedTokens = formatTokens(estimatedTokens)
    cache[2] = estimatedTokens
    cache[3] = formattedTokens
  } else {
    formattedTokens = cache[3]
  }
  const title = `This session is ${formattedAge} old and ${formattedTokens} tokens.`
  let onCancel
  if (cache[4] !== onDone) {
    onCancel = () => onDone('dismiss')
    cache[4] = onDone
    cache[5] = onCancel
  } else {
    onCancel = cache[5]
  }
  let description
  if (cache[6] === Symbol.for('react.memo_cache_sentinel')) {
    description = React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(
        Text,
        null,
        'Resuming the full session will consume a substantial portion of your usage limits. We recommend resuming from a summary.',
      ),
    )
    cache[6] = description
  } else {
    description = cache[6]
  }
  let compactOption
  if (cache[7] === Symbol.for('react.memo_cache_sentinel')) {
    compactOption = { value: 'compact', label: 'Resume from summary (recommended)' }
    cache[7] = compactOption
  } else {
    compactOption = cache[7]
  }
  let continueOption
  if (cache[8] === Symbol.for('react.memo_cache_sentinel')) {
    continueOption = { value: 'continue', label: 'Resume full session as-is' }
    cache[8] = continueOption
  } else {
    continueOption = cache[8]
  }
  let options
  if (cache[9] === Symbol.for('react.memo_cache_sentinel')) {
    options = [compactOption, continueOption, { value: 'never', label: "Don't ask me again" }]
    cache[9] = options
  } else {
    options = cache[9]
  }
  let select
  if (cache[10] !== onDone) {
    select = React.createElement(Select, { options, onChange: value => onDone(value) })
    cache[10] = onDone
    cache[11] = select
  } else {
    select = cache[11]
  }
  let dialog
  if (cache[12] !== title || cache[13] !== onCancel || cache[14] !== select) {
    dialog = React.createElement(Dialog, { title, onCancel }, description, select)
    cache[12] = title
    cache[13] = onCancel
    cache[14] = select
    cache[15] = dialog
  } else {
    dialog = cache[15]
  }
  return dialog
}

export function formatSessionAge(minutes: number): string {
  if (minutes < 60) return `${Math.floor(minutes)}m`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const remainingMinutes = Math.floor(minutes % 60)
    return remainingMinutes === 0
      ? `${hours}h`
      : `${hours}h ${remainingMinutes}m`
  }

  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return remainingHours === 0 ? `${days}d` : `${days}d ${remainingHours}h`
}

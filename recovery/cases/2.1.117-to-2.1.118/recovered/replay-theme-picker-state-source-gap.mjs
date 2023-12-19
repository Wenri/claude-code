#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.117-to-2.1.118'
const RELATIVE_PATH = 'src/commands/theme/theme.tsx'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export const TARGET118_THEME_PICKER_STATE_INPUT = Object.freeze({
  path: RELATIVE_PATH,
  bytes: 5451,
  sha256: '79acfbbd3f0c4ca440e3826ebbed736c3e5e2664a97d334596fd34decedce41b',
})

export const TARGET118_THEME_PICKER_STATE_OUTPUT = Object.freeze({
  path: RELATIVE_PATH,
  bytes: 5732,
  sha256: '2a4d365a87f4aa1b81c50de7ad3e2637c7bb7b997f8d7a15e610b63ed7712c5f',
})

const TARGET_FRAGMENT_EVIDENCE =
  'target118-theme-picker-state-target-fragment'
const SOURCE_REPLAY_EVIDENCE =
  'target118-theme-picker-state-source-replay-test'

export const TARGET118_THEME_PICKER_STATE_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:17047`,
    targetIndex: 17047,
    paths: Object.freeze([RELATIVE_PATH]),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      SOURCE_REPLAY_EVIDENCE,
    ]),
    behavior:
      'The authenticated Target118 theme picker uses a picker/editor discriminated state, converts saved slugs through toCustomThemeSetting, recognizes custom settings through fromCustomThemeSetting, and preserves the initial custom theme while editing.',
  }),
])

const IMPORT_BEFORE =
  `import { CustomThemeEditor } from '../../components/CustomThemeEditor.js'\n`
const IMPORT_AFTER = `${IMPORT_BEFORE}import {
  fromCustomThemeSetting,
  toCustomThemeSetting,
} from '../../utils/customThemes.js'
`
const FUNCTION_AFTER = `type Props = {
  onDone: (result?: string, options?: {
    display?: CommandResultDisplay;
  }) => void;
};
type ThemePickerState =
  | { kind: 'picker' }
  | { kind: 'editor'; initial: CustomTheme | undefined }
function ThemePickerCommand({ onDone }: Props) {
  const [currentTheme, setTheme] = useTheme()
  const { customThemes } = useCustomThemes()
  const [state, setState] = React.useState<ThemePickerState>({ kind: 'picker' })
  if (state.kind === 'editor') {
    return <CustomThemeEditor initial={state.initial} defaultBase={currentTheme} onDone={customTheme => {
      setTheme(toCustomThemeSetting(customTheme.slug))
      onDone(\`Using custom theme "\${customTheme.name}"\`)
    }} onCancel={() => setState({ kind: 'picker' })} />
  }
  return <Pane color="permission"><ThemePicker onThemeSelect={setting => {
    setTheme(setting)
    onDone(fromCustomThemeSetting(setting)
      ? \`Using custom theme "\${customThemes.find(theme => toCustomThemeSetting(theme.slug) === setting)?.name ?? setting}"\`
      : \`Theme set to \${setting}\`)
  }} onCustomTheme={initial => setState({ kind: 'editor', initial })} onCancel={() => onDone('Theme picker dismissed', { display: 'system' })} skipExitHandling={true} /></Pane>
}
`

function transform(input) {
  const functionStart = input.indexOf('type Props = {')
  const functionEnd = input.indexOf('export const call:', functionStart)
  if (
    functionStart < 0 ||
    functionEnd < 0 ||
    input.indexOf('type Props = {', functionStart + 1) >= 0 ||
    input.indexOf('export const call:', functionEnd + 1) >= 0
  ) {
    throw new Error('Target118 theme-picker declaration anchors differ')
  }
  const replacedFunction =
    input.slice(0, functionStart) +
    FUNCTION_AFTER +
    input.slice(functionEnd)
  if (replacedFunction.split(IMPORT_BEFORE).length !== 2) {
    throw new Error('Target118 theme-picker import anchor differs')
  }
  return replacedFunction.replace(IMPORT_BEFORE, IMPORT_AFTER)
}

export function applyTarget118ThemePickerStateReplay({ sourceRoot }) {
  const filename = path.join(sourceRoot, RELATIVE_PATH.replace(/^src\//, ''))
  const input = fs.readFileSync(filename)
  const current = { bytes: input.length, sha256: sha256(input) }
  if (
    current.bytes === TARGET118_THEME_PICKER_STATE_OUTPUT.bytes &&
    current.sha256 === TARGET118_THEME_PICKER_STATE_OUTPUT.sha256
  ) {
    return Object.freeze({ status: 'already-recovered', changed: false })
  }
  if (
    current.bytes !== TARGET118_THEME_PICKER_STATE_INPUT.bytes ||
    current.sha256 !== TARGET118_THEME_PICKER_STATE_INPUT.sha256
  ) {
    throw new Error(
      `Target118 theme-picker source has unknown preimage ${current.bytes}/${current.sha256}`,
    )
  }
  const output = transform(input.toString('utf8'))
  const outputBytes = Buffer.from(output)
  const actual = { bytes: outputBytes.length, sha256: sha256(outputBytes) }
  if (
    actual.bytes !== TARGET118_THEME_PICKER_STATE_OUTPUT.bytes ||
    actual.sha256 !== TARGET118_THEME_PICKER_STATE_OUTPUT.sha256
  ) {
    throw new Error(
      `Target118 theme-picker replay produced ${actual.bytes}/${actual.sha256}`,
    )
  }
  fs.writeFileSync(filename, outputBytes)
  return Object.freeze({ status: 'recovered', changed: true })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRoot = process.argv[2]
  if (!sourceRoot) {
    throw new Error('usage: replay-theme-picker-state-source-gap.mjs <source-root>')
  }
  console.log(applyTarget118ThemePickerStateReplay({ sourceRoot }))
}

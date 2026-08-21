#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_PERMISSION_CONFIRMATION_CONTEXT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/components/ConfirmationButtons.tsx',
    bytes: 843,
    sha256: '44e0c7df811030d27ed88eb313cac012fbdd2ed6a5baab03d9751070806f9960',
  }),
  Object.freeze({
    path: 'src/components/design-system/KeyboardShortcutHint.tsx',
    bytes: 14022,
    sha256: '003a5fcb34e20f2a8966397d29b42a1a3edbd9773707c1fa81314d5197b52335',
  }),
])

export const TARGET117_PERMISSION_CONFIRMATION_FILES = Object.freeze([
  Object.freeze({
    path: 'src/components/permissions/rules/RemoveWorkspaceDirectory.tsx',
    declaration: 'RemoveWorkspaceDirectory',
    raw: Object.freeze({
      bytes: 9757,
      sha256: '55b51b18b0360b2369c29ad90908c430b6e2a9645df2cb5b049f0cfcadc8f8f5',
    }),
    postimage: Object.freeze({
      bytes: 9226,
      sha256: 'ae977aae83cc55ac63a13144b2561d42d30111dca58e0de6995a7494f76e4ffd',
    }),
  }),
  Object.freeze({
    path: 'src/components/permissions/rules/PermissionRuleList.tsx',
    declaration: 'RuleDetails',
    raw: Object.freeze({
      bytes: 118930,
      sha256: '0dac9eff8f525e6ee17e53203454cf7f74906b9a944e245dfa95cb5ca18baee1',
    }),
    postimage: Object.freeze({
      bytes: 118487,
      sha256: 'c528df72caaa8fd4d71c0bc5d4a59a6cea1739618b282610ca5be9a0a16b0202',
    }),
  }),
  Object.freeze({
    path: 'src/components/design-system/Panel.tsx',
    declaration: 'Panel',
    raw: null,
    postimage: Object.freeze({
      bytes: 577,
      sha256: '98ea603561d20f5453e8248ef01417bb7f2500efbce8f6865d50457370a7e868',
    }),
    provenance: 'target-runtime-authenticated-authored-path-inferred',
  }),
])

const TARGET_EVIDENCE =
  'target117-permission-confirmation-complete-target-unit-proof'
const PANEL_EVIDENCE = 'target117-panel-runtime-and-module-boundary-proof'
const RETAINED_KEYBOARD_EVIDENCE =
  'target117-retained-keyboard-shortcut-contract-proof'
const SOURCE_REPLAY_EVIDENCE =
  'target117-permission-confirmation-panel-source-replay-test'

export const TARGET117_PERMISSION_CONFIRMATION_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:16972`,
    targetIndex: 16972,
    paths: Object.freeze([
      'src/components/permissions/rules/RemoveWorkspaceDirectory.tsx',
      'src/components/ConfirmationButtons.tsx',
    ]),
    declarations: Object.freeze([
      'RemoveWorkspaceDirectory',
      'ConfirmationButtons',
    ]),
    evidenceIds: Object.freeze([TARGET_EVIDENCE, SOURCE_REPLAY_EVIDENCE]),
    behavior:
      'Target117 removes the local yes/no Select adapter and delegates removal confirmation directly to ConfirmationButtons while retaining the exact directory update and Dialog behavior.',
  }),
  Object.freeze({
    key: `${CASE_NAME}:16982`,
    targetIndex: 16982,
    paths: Object.freeze([
      'src/components/permissions/rules/PermissionRuleList.tsx',
      'src/components/ConfirmationButtons.tsx',
      'src/components/design-system/Panel.tsx',
      'src/components/design-system/KeyboardShortcutHint.tsx',
    ]),
    declarations: Object.freeze([
      'RuleDetails',
      'ConfirmationButtons',
      'Panel',
      'KeyboardShortcutHint',
    ]),
    evidenceIds: Object.freeze([
      TARGET_EVIDENCE,
      PANEL_EVIDENCE,
      RETAINED_KEYBOARD_EVIDENCE,
      SOURCE_REPLAY_EVIDENCE,
    ]),
    behavior:
      'Target117 RuleDetails atomically adopts ConfirmationButtons for mutable rules, Panel for managed rules, and the retained chord-aware KeyboardShortcutHint footer; Panel runtime is authenticated while its authored path and spelling are a bounded source reconstruction.',
  }),
])

const PANEL_SOURCE = `import React from 'react'
import { Box, Text } from '../../ink.js'
import type { Theme } from '../../utils/theme.js'

type PanelProps = {
  children: React.ReactNode
  color?: keyof Theme
  title?: string
}

export function Panel({
  children,
  color,
  title,
}: PanelProps): React.ReactNode {
  return (
    <Box
      borderStyle="round"
      borderColor={color}
      flexDirection="column"
      paddingX={1}
      gap={title ? 1 : 0}
    >
      {title && (
        <Text bold color={color}>
          {title}
        </Text>
      )}
      {children}
    </Box>
  )
}
`

const REMOVE_DECLARATION = `export function RemoveWorkspaceDirectory(t0) {
  const $ = _c(15);
  const {
    directoryPath,
    onRemove,
    onCancel,
    permissionContext,
    setPermissionContext
  } = t0;
  let t1;
  if ($[0] !== directoryPath || $[1] !== onRemove || $[2] !== permissionContext || $[3] !== setPermissionContext) {
    t1 = () => {
      const updatedContext = applyPermissionUpdate(permissionContext, {
        type: "removeDirectories",
        directories: [directoryPath],
        destination: "session"
      });
      setPermissionContext(updatedContext);
      onRemove();
    };
    $[0] = directoryPath;
    $[1] = onRemove;
    $[2] = permissionContext;
    $[3] = setPermissionContext;
    $[4] = t1;
  } else {
    t1 = $[4];
  }
  const handleRemove = t1;
  let t2;
  if ($[5] !== directoryPath) {
    t2 = <Box marginX={2} flexDirection="column"><Text bold={true}>{directoryPath}</Text></Box>;
    $[5] = directoryPath;
    $[6] = t2;
  } else {
    t2 = $[6];
  }
  let t3;
  if ($[7] === Symbol.for("react.memo_cache_sentinel")) {
    t3 = <Text>Claude Code will no longer have access to files in this directory.</Text>;
    $[7] = t3;
  } else {
    t3 = $[7];
  }
  let t4;
  if ($[8] !== handleRemove || $[9] !== onCancel) {
    t4 = <ConfirmationButtons onConfirm={handleRemove} onCancel={onCancel} />;
    $[8] = handleRemove;
    $[9] = onCancel;
    $[10] = t4;
  } else {
    t4 = $[10];
  }
  let t5;
  if ($[11] !== onCancel || $[12] !== t2 || $[13] !== t4) {
    t5 = <Dialog title="Remove directory from workspace?" onCancel={onCancel} color="error">{t2}{t3}{t4}</Dialog>;
    $[11] = onCancel;
    $[12] = t2;
    $[13] = t4;
    $[14] = t5;
  } else {
    t5 = $[14];
  }
  return t5;
}`

const RULE_DETAILS_DECLARATION = `function RuleDetails(t0) {
  const $ = _c(37);
  const {
    rule,
    onDelete,
    onCancel
  } = t0;
  const exitState = useExitOnCtrlCDWithKeybindings();
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = {
      context: "Confirmation"
    };
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  useKeybinding("confirm:no", onCancel, t1);
  let t2;
  if ($[1] !== rule.ruleValue) {
    t2 = permissionRuleValueToString(rule.ruleValue);
    $[1] = rule.ruleValue;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  let t3;
  if ($[3] !== t2) {
    t3 = <Text bold={true}>{t2}</Text>;
    $[3] = t2;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  let t4;
  if ($[5] !== rule.ruleValue) {
    t4 = <PermissionRuleDescription ruleValue={rule.ruleValue} />;
    $[5] = rule.ruleValue;
    $[6] = t4;
  } else {
    t4 = $[6];
  }
  let t5;
  if ($[7] !== rule) {
    t5 = <RuleSourceText rule={rule} />;
    $[7] = rule;
    $[8] = t5;
  } else {
    t5 = $[8];
  }
  let t6;
  if ($[9] !== t3 || $[10] !== t4 || $[11] !== t5) {
    t6 = <Box flexDirection="column" marginX={2}>{t3}{t4}{t5}</Box>;
    $[9] = t3;
    $[10] = t4;
    $[11] = t5;
    $[12] = t6;
  } else {
    t6 = $[12];
  }
  const ruleDescription = t6;
  let t7;
  if ($[13] !== exitState.keyName || $[14] !== exitState.pending) {
    t7 = <Box marginLeft={3}>{exitState.pending ? <Text dimColor={true}>Press {exitState.keyName} again to exit</Text> : <Text dimColor={true}><KeyboardShortcutHint chord="escape" action="cancel" /></Text>}</Box>;
    $[13] = exitState.keyName;
    $[14] = exitState.pending;
    $[15] = t7;
  } else {
    t7 = $[15];
  }
  const footer = t7;
  if (rule.source === "policySettings") {
    let t8;
    if ($[16] === Symbol.for("react.memo_cache_sentinel")) {
      t8 = <Text italic={true}>This rule is configured by managed settings and cannot be modified.{"\\n"}Contact your system administrator for more information.</Text>;
      $[16] = t8;
    } else {
      t8 = $[16];
    }
    let t9;
    if ($[17] !== ruleDescription) {
      t9 = <Panel color="permission" title="Rule details">{ruleDescription}{t8}</Panel>;
      $[17] = ruleDescription;
      $[18] = t9;
    } else {
      t9 = $[18];
    }
    let t10;
    if ($[19] !== footer || $[20] !== t9) {
      t10 = <>{t9}{footer}</>;
      $[19] = footer;
      $[20] = t9;
      $[21] = t10;
    } else {
      t10 = $[21];
    }
    return t10;
  }
  let t8;
  if ($[22] !== rule.ruleBehavior) {
    t8 = getRuleBehaviorLabel(rule.ruleBehavior);
    $[22] = rule.ruleBehavior;
    $[23] = t8;
  } else {
    t8 = $[23];
  }
  let t9;
  if ($[24] !== t8) {
    t9 = <Text bold={true} color="error">Delete {t8} tool?</Text>;
    $[24] = t8;
    $[25] = t9;
  } else {
    t9 = $[25];
  }
  let t10;
  if ($[26] === Symbol.for("react.memo_cache_sentinel")) {
    t10 = <Text>Are you sure you want to delete this permission rule?</Text>;
    $[26] = t10;
  } else {
    t10 = $[26];
  }
  let t11;
  if ($[27] !== onCancel || $[28] !== onDelete) {
    t11 = <ConfirmationButtons onConfirm={onDelete} onCancel={onCancel} />;
    $[27] = onCancel;
    $[28] = onDelete;
    $[29] = t11;
  } else {
    t11 = $[29];
  }
  let t12;
  if ($[30] !== ruleDescription || $[31] !== t11 || $[32] !== t9) {
    t12 = <Box flexDirection="column" gap={1} borderStyle="round" paddingLeft={1} paddingRight={1} borderColor="error">{t9}{ruleDescription}{t10}{t11}</Box>;
    $[30] = ruleDescription;
    $[31] = t11;
    $[32] = t9;
    $[33] = t12;
  } else {
    t12 = $[33];
  }
  let t13;
  if ($[34] !== footer || $[35] !== t12) {
    t13 = <>{t12}{footer}</>;
    $[34] = footer;
    $[35] = t12;
    $[36] = t13;
  } else {
    t13 = $[36];
  }
  return t13;
}`

const REMOVE_IMPORT = Object.freeze({
  before: "import { Select } from '../../../components/CustomSelect/select.js';",
  after: "import { ConfirmationButtons } from '../../ConfirmationButtons.js';",
})

const PERMISSION_SELECT_IMPORT = Object.freeze({
  before: "import { Select } from '../../../components/CustomSelect/select.js';",
  after: [
    "import { Select } from '../../../components/CustomSelect/select.js';",
    "import { ConfirmationButtons } from '../../ConfirmationButtons.js';",
  ].join('\n'),
})

const PERMISSION_DESIGN_SYSTEM_IMPORTS = Object.freeze({
  before: "import { Pane } from '../../design-system/Pane.js';",
  after: [
    "import { KeyboardShortcutHint } from '../../design-system/KeyboardShortcutHint.js';",
    "import { Pane } from '../../design-system/Pane.js';",
    "import { Panel } from '../../design-system/Panel.js';",
  ].join('\n'),
})

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function descriptorsEqual(left, right) {
  return left.bytes === right.bytes && left.sha256 === right.sha256
}

function occurrenceCount(source, needle) {
  let count = 0
  let offset = 0
  while ((offset = source.indexOf(needle, offset)) !== -1) {
    count++
    offset += needle.length
  }
  return count
}

function replaceOnce(source, before, after, label) {
  const count = occurrenceCount(source, before)
  if (count !== 1) {
    throw new Error(`${label}: expected one replay anchor, got ${count}`)
  }
  return source.replace(before, after)
}

function replaceDeclaration(source, startAnchor, endAnchor, postimage, label) {
  const starts = occurrenceCount(source, startAnchor)
  const ends = occurrenceCount(source, endAnchor)
  if (starts !== 1 || ends !== 1) {
    throw new Error(
      `${label}: expected one declaration boundary, got ${starts}/${ends}`,
    )
  }
  const start = source.indexOf(startAnchor)
  const boundary = source.indexOf(endAnchor, start)
  if (boundary < start) throw new Error(`${label}: invalid declaration boundary`)
  const end = boundary + 2
  return `${source.slice(0, start)}${postimage}${source.slice(end)}`
}

function sourceFilename(sourceRoot, sourcePath) {
  if (!sourcePath.startsWith('src/')) {
    throw new Error(`${sourcePath}: invalid src path`)
  }
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${sourcePath}: escapes supplied source root`)
  }
  return filename
}

function readRealFile(filename, sourcePath) {
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${sourcePath}: expected a real source file`)
  }
  return fs.readFileSync(filename)
}

function assertContexts(sourceRoot) {
  for (const expected of TARGET117_PERMISSION_CONFIRMATION_CONTEXT_FILES) {
    const filename = sourceFilename(sourceRoot, expected.path)
    if (!fs.existsSync(filename)) {
      throw new Error(`${expected.path}: required Target117 context is absent`)
    }
    const actual = descriptor(readRealFile(filename, expected.path))
    if (!descriptorsEqual(actual, expected)) {
      throw new Error(
        `${expected.path}: refusing non-Target117 context ${actual.bytes}/${actual.sha256}`,
      )
    }
  }
}

function classify(sourceRoot) {
  const states = TARGET117_PERMISSION_CONFIRMATION_FILES.map(expected => {
    const filename = sourceFilename(sourceRoot, expected.path)
    if (!fs.existsSync(filename)) {
      if (expected.raw === null) {
        return { expected, filename, source: null, state: 'raw' }
      }
      throw new Error(`${expected.path}: required Target117 source is absent`)
    }
    const input = readRealFile(filename, expected.path)
    const actual = descriptor(input)
    if (expected.raw && descriptorsEqual(actual, expected.raw)) {
      return { expected, filename, source: input.toString('utf8'), state: 'raw' }
    }
    if (descriptorsEqual(actual, expected.postimage)) {
      return {
        expected,
        filename,
        source: input.toString('utf8'),
        state: 'postimage',
      }
    }
    throw new Error(
      `${expected.path}: refusing mixed or non-Target117 state ${actual.bytes}/${actual.sha256}`,
    )
  })
  const distinct = new Set(states.map(file => file.state))
  if (distinct.size !== 1) {
    throw new Error(
      `Target117 permission confirmation replay refuses mixed source state: ${states
        .map(file => `${file.expected.path}=${file.state}`)
        .join(', ')}`,
    )
  }
  return states
}

function recover(file) {
  let output
  switch (file.expected.path) {
    case 'src/components/permissions/rules/RemoveWorkspaceDirectory.tsx':
      output = replaceOnce(
        file.source,
        REMOVE_IMPORT.before,
        REMOVE_IMPORT.after,
        'RemoveWorkspaceDirectory ConfirmationButtons import',
      )
      output = replaceDeclaration(
        output,
        'export function RemoveWorkspaceDirectory(t0) {',
        '\n}\n//# sourceMappingURL=',
        REMOVE_DECLARATION,
        'RemoveWorkspaceDirectory declaration',
      )
      break
    case 'src/components/permissions/rules/PermissionRuleList.tsx':
      output = replaceOnce(
        file.source,
        PERMISSION_SELECT_IMPORT.before,
        PERMISSION_SELECT_IMPORT.after,
        'PermissionRuleList ConfirmationButtons import',
      )
      output = replaceOnce(
        output,
        PERMISSION_DESIGN_SYSTEM_IMPORTS.before,
        PERMISSION_DESIGN_SYSTEM_IMPORTS.after,
        'PermissionRuleList retained design-system imports',
      )
      output = replaceDeclaration(
        output,
        'function RuleDetails(t0) {',
        '\n}\ntype RulesTabContentProps =',
        RULE_DETAILS_DECLARATION,
        'PermissionRuleList RuleDetails declaration',
      )
      break
    case 'src/components/design-system/Panel.tsx':
      output = PANEL_SOURCE
      break
    default:
      throw new Error(`${file.expected.path}: missing replay transform`)
  }
  const bytes = Buffer.from(output)
  const actual = descriptor(bytes)
  if (!descriptorsEqual(actual, file.expected.postimage)) {
    throw new Error(
      `${file.expected.path}: replay drift ${actual.bytes}/${actual.sha256}`,
    )
  }
  return bytes
}

export function applyTarget117PermissionConfirmationPanelSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  assertContexts(sourceRoot)
  const files = classify(sourceRoot)
  if (files[0].state === 'postimage') {
    return Object.freeze({ changed: 0, files: Object.freeze([]) })
  }
  const outputs = files.map(file => ({ file, bytes: recover(file) }))
  for (const { file, bytes } of outputs) {
    fs.mkdirSync(path.dirname(file.filename), { recursive: true })
    fs.writeFileSync(file.filename, bytes)
  }
  return Object.freeze({
    changed: outputs.length,
    files: Object.freeze(outputs.map(({ file }) => file.expected.path)),
  })
}

#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_TRUNCATED_COUNT_CONSUMER_CONTEXT_FILE = Object.freeze({
  path: 'src/components/TruncatedCount.tsx',
  bytes: 681,
  sha256: 'd1cfad7aa51c6e23a2acbc26858c6d711b872d86380fdeed594e8caf05338672',
})

export const TARGET117_TRUNCATED_COUNT_CONSUMER_FILES = Object.freeze([
  Object.freeze({
    path: 'src/components/messages/SystemTextMessage.tsx',
    declaration: 'MemorySavedMessage',
    raw: Object.freeze({
      bytes: 79395,
      sha256: '50dc1b23380f7a935603ca11cfb0bfd50c5ec94b9bddc3b6754be37acdc9b66d',
    }),
    postimage: Object.freeze({
      bytes: 80465,
      sha256: '46d159b986799258157ad0c4ba1bc0f3fe026666b16369e7297fbc0e0c816f58',
    }),
  }),
  Object.freeze({
    path: 'src/tools/AgentTool/UI.tsx',
    declaration: 'renderToolUseProgressMessage',
    raw: Object.freeze({
      bytes: 125359,
      sha256: 'ec572743582b458da27869933927b8b44e9707ab26cfd304c5dc5afff6bcfe34',
    }),
    postimage: Object.freeze({
      bytes: 125323,
      sha256: '929ccdb35072e74a4ca264ad28bdcc3ced3e3d6fb0e992f5fb2c3e41d35e2276',
    }),
  }),
  Object.freeze({
    path: 'src/tools/SkillTool/UI.tsx',
    declaration: 'renderToolUseProgressMessage',
    raw: Object.freeze({
      bytes: 19189,
      sha256: 'cd40ed905b5f411b34eae96aca77302e4782ae6ea95bbdc6d37fde9281f5b8e0',
    }),
    postimage: Object.freeze({
      bytes: 19192,
      sha256: '946028b0bbd4ced3ac340822f4a6bd8571339e7d92b155e7976a2597bdb96565',
    }),
  }),
  Object.freeze({
    path: 'src/tools/FileWriteTool/UI.tsx',
    declaration: 'FileWriteToolCreatedMessage',
    raw: Object.freeze({
      bytes: 42851,
      sha256: '3a672a167c5e09b1eaf38bc834c2bf9e896dbcef7fa4b5997d80ddbe21e6129a',
    }),
    postimage: Object.freeze({
      bytes: 42768,
      sha256: '47aa617f6ba4ee871314068ded73b0499bbda661e9c29251abc6ea8f131c4ad4',
    }),
  }),
])

const TARGET_UNIT_EVIDENCE =
  'target117-truncated-count-consumers-complete-target-unit-proof'
const SOURCE_REPLAY_EVIDENCE =
  'target117-truncated-count-consumers-source-replay-test'
const TEMPORAL_EVIDENCE =
  'target117-truncated-count-consumers-temporal-boundary-proof'

function ownerOverride(targetIndex, path, declaration, behavior) {
  const ownerDeclarations = Array.isArray(declaration) ? declaration : [declaration]
  return Object.freeze({
    key: `${CASE_NAME}:${targetIndex}`,
    targetIndex,
    paths: Object.freeze([path, TARGET117_TRUNCATED_COUNT_CONSUMER_CONTEXT_FILE.path]),
    declarations: Object.freeze([...ownerDeclarations, 'TruncatedCount']),
    evidenceIds: Object.freeze([
      TARGET_UNIT_EVIDENCE,
      SOURCE_REPLAY_EVIDENCE,
      TEMPORAL_EVIDENCE,
    ]),
    behavior,
  })
}

export const TARGET117_TRUNCATED_COUNT_CONSUMER_OWNER_OVERRIDES = Object.freeze([
  ownerOverride(
    12519,
    'src/components/messages/SystemTextMessage.tsx',
    ['SystemTextMessage', 'MemorySavedMessage'],
    'Target117 limits non-verbose saved-memory paths to three rows and delegates the remaining file count to TruncatedCount with expansion enabled.',
  ),
  ownerOverride(
    12569,
    'src/tools/AgentTool/UI.tsx',
    'renderToolUseProgressMessage',
    'Target117 delegates the count of hidden Agent progress tool uses to TruncatedCount and retains the transcript expansion affordance.',
  ),
  ownerOverride(
    12598,
    'src/tools/SkillTool/UI.tsx',
    'renderToolUseProgressMessage',
    'Target117 delegates the count of hidden Skill progress tool uses to TruncatedCount without claiming an expansion control.',
  ),
  ownerOverride(
    12843,
    'src/tools/FileWriteTool/UI.tsx',
    'FileWriteToolCreatedMessage',
    'Target117 delegates non-verbose omitted FileWrite preview lines to TruncatedCount with expansion enabled.',
  ),
])

const SYSTEM_IMPORT_ANCHOR =
  "import { CtrlOToExpand } from '../CtrlOToExpand.js';"
const SYSTEM_IMPORT_POSTIMAGE =
  "import { TruncatedCount } from '../TruncatedCount.js';"
const SYSTEM_PROPS_ANCHOR = [
  '  isTranscriptMode?: boolean;',
  '};',
  'export function SystemTextMessage(t0) {',
  '  const $ = _c(51);',
].join('\n')
const SYSTEM_PROPS_POSTIMAGE = [
  '  isTranscriptMode?: boolean;',
  '};',
  'const MAX_MEMORY_FILES_TO_SHOW = 3;',
  'export function SystemTextMessage(t0) {',
  '  const $ = _c(53);',
].join('\n')
const SYSTEM_DECLARATION_START = 'function MemorySavedMessage(t0) {'
const SYSTEM_DECLARATION_END = '\nfunction _temp5(p) {'
const SYSTEM_CALLER_ANCHOR = [
  '  if (message.subtype === "memory_saved") {',
  '    let t1;',
  '    if ($[3] !== addMargin || $[4] !== message) {',
  '      t1 = <MemorySavedMessage message={message} addMargin={addMargin} />;',
  '      $[3] = addMargin;',
  '      $[4] = message;',
  '      $[5] = t1;',
  '    } else {',
  '      t1 = $[5];',
  '    }',
  '    return t1;',
  '  }',
].join('\n')
const SYSTEM_CALLER_POSTIMAGE = [
  '  if (message.subtype === "memory_saved") {',
  '    const t1 = verbose || !!isTranscriptMode;',
  '    let t2;',
  '    if ($[3] !== addMargin || $[4] !== message || $[5] !== t1) {',
  '      t2 = <MemorySavedMessage message={message} addMargin={addMargin} verbose={t1} />;',
  '      $[3] = addMargin;',
  '      $[4] = message;',
  '      $[5] = t1;',
  '      $[6] = t2;',
  '    } else {',
  '      t2 = $[6];',
  '    }',
  '    return t2;',
  '  }',
].join('\n')
const SYSTEM_AWAY_ANCHOR = [
  '  if (message.subtype === "away_summary") {',
  '    const t1 = addMargin ? 1 : 0;',
  '    let t2;',
  '    if ($[6] === Symbol.for("react.memo_cache_sentinel")) {',
  '      t2 = <Box minWidth={2}><Text dimColor={true}>{REFERENCE_MARK}</Text></Box>;',
  '      $[6] = t2;',
  '    } else {',
  '      t2 = $[6];',
  '    }',
  '    let t3;',
  '    if ($[7] !== message.content) {',
  '      t3 = <Text dimColor={true}>{message.content}</Text>;',
  '      $[7] = message.content;',
  '      $[8] = t3;',
  '    } else {',
  '      t3 = $[8];',
  '    }',
  '    let t4;',
  '    if ($[9] !== bg || $[10] !== t1 || $[11] !== t3) {',
  '      t4 = <Box flexDirection="row" marginTop={t1} backgroundColor={bg} width="100%">{t2}{t3}</Box>;',
  '      $[9] = bg;',
  '      $[10] = t1;',
  '      $[11] = t3;',
  '      $[12] = t4;',
  '    } else {',
  '      t4 = $[12];',
  '    }',
  '    return t4;',
  '  }',
].join('\n')
const SYSTEM_AWAY_POSTIMAGE = [
  '  if (message.subtype === "away_summary") {',
  '    const t1 = addMargin ? 1 : 0;',
  '    let t2;',
  '    if ($[7] === Symbol.for("react.memo_cache_sentinel")) {',
  '      t2 = <Box minWidth={2}><Text dimColor={true}>{REFERENCE_MARK}</Text></Box>;',
  '      $[7] = t2;',
  '    } else {',
  '      t2 = $[7];',
  '    }',
  '    let t3;',
  '    if ($[8] === Symbol.for("react.memo_cache_sentinel")) {',
  '      t3 = <Text dimColor={true} bold={true}>recap:{" "}</Text>;',
  '      $[8] = t3;',
  '    } else {',
  '      t3 = $[8];',
  '    }',
  '    let t4;',
  '    if ($[9] !== message.content) {',
  '      t4 = <Text>{t3}<Text dimColor={true} italic={true}>{message.content}</Text></Text>;',
  '      $[9] = message.content;',
  '      $[10] = t4;',
  '    } else {',
  '      t4 = $[10];',
  '    }',
  '    let t5;',
  '    if ($[11] !== bg || $[12] !== t1 || $[13] !== t4) {',
  '      t5 = <Box flexDirection="row" marginTop={t1} backgroundColor={bg} width="100%">{t2}{t4}</Box>;',
  '      $[11] = bg;',
  '      $[12] = t1;',
  '      $[13] = t4;',
  '      $[14] = t5;',
  '    } else {',
  '      t5 = $[14];',
  '    }',
  '    return t5;',
  '  }',
].join('\n')
const SYSTEM_SHIFTED_TAIL_START = '  if (message.subtype === "agents_killed") {'
const SYSTEM_CALLER_DECLARATION_END = '\nfunction StopHookSummaryMessage(t0) {'
const SYSTEM_POST_DECLARATION = [
  'function MemorySavedMessage(t0) {',
  '  const $ = _c(22);',
  '  const {',
  '    message,',
  '    addMargin,',
  '    verbose',
  '  } = t0;',
  '  const bg = useSelectedMessageBg();',
  '  const {',
  '    writtenPaths',
  '  } = message;',
  '  let t1;',
  '  if ($[0] !== message) {',
  '    t1 = feature("TEAMMEM") ? teamMemSaved.teamMemSavedPart(message) : null;',
  '    $[0] = message;',
  '    $[1] = t1;',
  '  } else {',
  '    t1 = $[1];',
  '  }',
  '  const team = t1;',
  '  const privateCount = writtenPaths.length - (team?.count ?? 0);',
  '  const t2 = privateCount > 0 ? `${privateCount} ${privateCount === 1 ? "memory" : "memories"}` : null;',
  '  const t3 = team?.segment;',
  '  let t4;',
  '  if ($[2] !== t2 || $[3] !== t3) {',
  '    t4 = [t2, t3].filter(Boolean);',
  '    $[2] = t2;',
  '    $[3] = t3;',
  '    $[4] = t4;',
  '  } else {',
  '    t4 = $[4];',
  '  }',
  '  const parts = t4;',
  '  let displayedPaths;',
  '  if ($[5] !== verbose || $[6] !== writtenPaths) {',
  '    displayedPaths = verbose ? writtenPaths : writtenPaths.slice(0, MAX_MEMORY_FILES_TO_SHOW);',
  '    $[5] = verbose;',
  '    $[6] = writtenPaths;',
  '    $[7] = displayedPaths;',
  '  } else {',
  '    displayedPaths = $[7];',
  '  }',
  '  const hiddenCount = writtenPaths.length - displayedPaths.length;',
  '  const t5 = addMargin ? 1 : 0;',
  '  let t6;',
  '  if ($[8] === Symbol.for("react.memo_cache_sentinel")) {',
  '    t6 = <Box minWidth={2}><Text dimColor={true}>{BLACK_CIRCLE}</Text></Box>;',
  '    $[8] = t6;',
  '  } else {',
  '    t6 = $[8];',
  '  }',
  '  const t7 = message.verb ?? "Saved";',
  '  const t8 = parts.join(" \\xB7 ");',
  '  let t9;',
  '  if ($[9] !== t7 || $[10] !== t8) {',
  '    t9 = <Box flexDirection="row">{t6}<Text>{t7} {t8}</Text></Box>;',
  '    $[9] = t7;',
  '    $[10] = t8;',
  '    $[11] = t9;',
  '  } else {',
  '    t9 = $[11];',
  '  }',
  '  let t10;',
  '  if ($[12] !== displayedPaths) {',
  '    t10 = displayedPaths.map(_temp5);',
  '    $[12] = displayedPaths;',
  '    $[13] = t10;',
  '  } else {',
  '    t10 = $[13];',
  '  }',
  '  let t11;',
  '  if ($[14] !== hiddenCount) {',
  '    t11 = hiddenCount > 0 && <MessageResponse><TruncatedCount count={hiddenCount} unit="file" expandable={true} /></MessageResponse>;',
  '    $[14] = hiddenCount;',
  '    $[15] = t11;',
  '  } else {',
  '    t11 = $[15];',
  '  }',
  '  let t12;',
  '  if ($[16] !== bg || $[17] !== t9 || $[18] !== t10 || $[19] !== t11 || $[20] !== t5) {',
  '    t12 = <Box flexDirection="column" marginTop={t5} backgroundColor={bg}>{t9}{t10}{t11}</Box>;',
  '    $[16] = bg;',
  '    $[17] = t9;',
  '    $[18] = t10;',
  '    $[19] = t11;',
  '    $[20] = t5;',
  '    $[21] = t12;',
  '  } else {',
  '    t12 = $[21];',
  '  }',
  '  return t12;',
  '}',
].join('\n')

const AGENT_IMPORT_ANCHOR =
  "import { CtrlOToExpand, SubAgentProvider } from 'src/components/CtrlOToExpand.js';"
const TOOL_IMPORT_POSTIMAGE =
  "import { TruncatedCount } from '../../components/TruncatedCount.js';"
const AGENT_RENDER_ANCHOR = [
  '{hiddenToolUseCount > 0 && <Text dimColor>',
  "            +{hiddenToolUseCount} more tool{' '}",
  "            {hiddenToolUseCount === 1 ? 'use' : 'uses'} <CtrlOToExpand />",
  '          </Text>}',
].join('\n')
const AGENT_RENDER_POSTIMAGE =
  '<TruncatedCount count={hiddenToolUseCount} unit="tool use" expandable={true} />'

const SKILL_IMPORT_ANCHOR =
  "import { SubAgentProvider } from 'src/components/CtrlOToExpand.js';"
const SKILL_RENDER_ANCHOR = [
  '{hiddenCount > 0 && <Text dimColor>',
  "            +{hiddenCount} more tool {plural(hiddenCount, 'use')}",
  '          </Text>}',
].join('\n')
const SKILL_RENDER_POSTIMAGE =
  '<TruncatedCount count={hiddenCount} unit="tool use" />'

const FILE_WRITE_IMPORT_ANCHOR =
  "import { CtrlOToExpand } from '../../components/CtrlOToExpand.js';"
const FILE_WRITE_RENDER_ANCHOR =
  '{!verbose && plusLines > 0 && <Text dimColor={true}>… +{plusLines} {plusLines === 1 ? "line" : "lines"}{" "}{numLines > 0 && <CtrlOToExpand />}</Text>}'
const FILE_WRITE_RENDER_POSTIMAGE =
  '{!verbose && <TruncatedCount count={plusLines} expandable={true} />}'

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

function replaceExactlyOnce(source, before, after, label) {
  const count = occurrenceCount(source, before)
  if (count !== 1) throw new Error(`${label}: expected one replay anchor, got ${count}`)
  return source.replace(before, after)
}

function sourceFilename(sourceRoot, sourcePath) {
  if (!sourcePath.startsWith('src/')) {
    throw new Error(`${sourcePath}: expected a normalized src path`)
  }
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${sourcePath}: escapes the supplied source root`)
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

function assertContext(sourceRoot) {
  const expected = TARGET117_TRUNCATED_COUNT_CONSUMER_CONTEXT_FILE
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

function classifyFile(sourceRoot, expected) {
  const filename = sourceFilename(sourceRoot, expected.path)
  const input = readRealFile(filename, expected.path)
  const actual = descriptor(input)
  if (descriptorsEqual(actual, expected.raw)) {
    return { expected, filename, input, source: input.toString('utf8'), state: 'raw' }
  }
  if (descriptorsEqual(actual, expected.postimage)) {
    return { expected, filename, input, source: input.toString('utf8'), state: 'postimage' }
  }
  throw new Error(
    `${expected.path}: refusing mixed or non-Target117 state ${actual.bytes}/${actual.sha256}`,
  )
}

function recoverSystem(source) {
  let output = replaceExactlyOnce(
    source,
    SYSTEM_IMPORT_ANCHOR,
    `${SYSTEM_IMPORT_ANCHOR}\n${SYSTEM_IMPORT_POSTIMAGE}`,
    'SystemTextMessage import',
  )
  output = replaceExactlyOnce(
    output,
    SYSTEM_PROPS_ANCHOR,
    SYSTEM_PROPS_POSTIMAGE,
    'SystemTextMessage cache and memory limit',
  )
  output = replaceExactlyOnce(
    output,
    SYSTEM_CALLER_ANCHOR,
    SYSTEM_CALLER_POSTIMAGE,
    'SystemTextMessage memory-saved caller',
  )
  output = replaceExactlyOnce(
    output,
    SYSTEM_AWAY_ANCHOR,
    SYSTEM_AWAY_POSTIMAGE,
    'SystemTextMessage inherited recap branch',
  )
  const tailStart = output.indexOf(SYSTEM_SHIFTED_TAIL_START)
  const callerEnd = output.indexOf(SYSTEM_CALLER_DECLARATION_END, tailStart)
  if (tailStart === -1 || callerEnd === -1) {
    throw new Error('SystemTextMessage: missing cache-shift boundary')
  }
  const shiftedTail = output
    .slice(tailStart, callerEnd)
    .replace(/\$\[(\d+)\]/g, (_match, index) => `$[${Number(index) + 2}]`)
  output = `${output.slice(0, tailStart)}${shiftedTail}${output.slice(callerEnd)}`
  const start = output.indexOf(SYSTEM_DECLARATION_START)
  const end = output.indexOf(SYSTEM_DECLARATION_END, start)
  if (start === -1 || end === -1 || output.indexOf(SYSTEM_DECLARATION_START, start + 1) !== -1) {
    throw new Error('SystemTextMessage: expected one MemorySavedMessage declaration boundary')
  }
  output = `${output.slice(0, start)}${SYSTEM_POST_DECLARATION}${output.slice(end)}`
  return output
}

function recoverAgent(source) {
  let output = replaceExactlyOnce(
    source,
    AGENT_IMPORT_ANCHOR,
    `${AGENT_IMPORT_ANCHOR}\n${TOOL_IMPORT_POSTIMAGE}`,
    'AgentTool import',
  )
  output = replaceExactlyOnce(
    output,
    AGENT_RENDER_ANCHOR,
    AGENT_RENDER_POSTIMAGE,
    'AgentTool TruncatedCount delegation',
  )
  return output
}

function recoverSkill(source) {
  let output = replaceExactlyOnce(
    source,
    SKILL_IMPORT_ANCHOR,
    `${SKILL_IMPORT_ANCHOR}\n${TOOL_IMPORT_POSTIMAGE}`,
    'SkillTool import',
  )
  output = replaceExactlyOnce(
    output,
    SKILL_RENDER_ANCHOR,
    SKILL_RENDER_POSTIMAGE,
    'SkillTool TruncatedCount delegation',
  )
  return output
}

function recoverFileWrite(source) {
  let output = replaceExactlyOnce(
    source,
    FILE_WRITE_IMPORT_ANCHOR,
    TOOL_IMPORT_POSTIMAGE,
    'FileWriteTool import',
  )
  output = replaceExactlyOnce(
    output,
    FILE_WRITE_RENDER_ANCHOR,
    FILE_WRITE_RENDER_POSTIMAGE,
    'FileWriteTool TruncatedCount delegation',
  )
  return output
}

function recoverFile(file) {
  const transforms = new Map([
    ['src/components/messages/SystemTextMessage.tsx', recoverSystem],
    ['src/tools/AgentTool/UI.tsx', recoverAgent],
    ['src/tools/SkillTool/UI.tsx', recoverSkill],
    ['src/tools/FileWriteTool/UI.tsx', recoverFileWrite],
  ])
  const transform = transforms.get(file.expected.path)
  if (!transform) throw new Error(`${file.expected.path}: missing replay transform`)
  const output = Buffer.from(transform(file.source))
  const actual = descriptor(output)
  if (!descriptorsEqual(actual, file.expected.postimage)) {
    throw new Error(
      `${file.expected.path}: replay drift ${actual.bytes}/${actual.sha256}`,
    )
  }
  return output
}

export function applyTarget117TruncatedCountConsumerSourceRecovery({ sourceRoot } = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  assertContext(sourceRoot)
  const files = TARGET117_TRUNCATED_COUNT_CONSUMER_FILES.map(expected =>
    classifyFile(sourceRoot, expected),
  )
  const states = new Set(files.map(file => file.state))
  if (states.size === 1 && states.has('postimage')) {
    return Object.freeze({
      caseName: CASE_NAME,
      status: 'already-recovered',
      files: TARGET117_TRUNCATED_COUNT_CONSUMER_FILES,
      ownerOverrides: TARGET117_TRUNCATED_COUNT_CONSUMER_OWNER_OVERRIDES.length,
    })
  }
  if (states.size !== 1 || !states.has('raw')) {
    throw new Error(
      `Refusing mixed truncated-count consumer recovery: ${files.map(file => `${file.expected.path}=${file.state}`).join(', ')}`,
    )
  }

  const outputs = files.map(file => ({ file, output: recoverFile(file) }))
  for (const { file, output } of outputs) fs.writeFileSync(file.filename, output)
  for (const { file } of outputs) {
    if (classifyFile(sourceRoot, file.expected).state !== 'postimage') {
      throw new Error(`${file.expected.path}: written replay did not retain its postimage`)
    }
  }
  return Object.freeze({
    caseName: CASE_NAME,
    status: 'recovered',
    files: TARGET117_TRUNCATED_COUNT_CONSUMER_FILES,
    ownerOverrides: TARGET117_TRUNCATED_COUNT_CONSUMER_OWNER_OVERRIDES.length,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget117TruncatedCountConsumerSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

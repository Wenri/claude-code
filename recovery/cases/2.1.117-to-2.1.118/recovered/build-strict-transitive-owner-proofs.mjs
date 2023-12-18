#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import { summarizeSourceTree } from '../../../scripts/verify-source-lineage.mjs'
import {
  constructTarget118StrictTransitiveFiles,
  TARGET118_STRICT_TRANSITIVE_INPUT_FILES,
  TARGET118_STRICT_TRANSITIVE_OWNER_OVERRIDES,
  TARGET118_STRICT_TRANSITIVE_RAW_SOURCE_TREE,
  TARGET118_STRICT_TRANSITIVE_RECOVERED_SOURCE_FILES,
  TARGET118_STRICT_TRANSITIVE_RECOVERED_SOURCE_TREE,
  TARGET118_STRICT_TRANSITIVE_SOURCE_GAP_OVERRIDES,
} from './replay-strict-transitive-source-gaps.mjs'

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url))
const historicalRoot = path.join(
  repositoryRoot,
  '.recovery-tmp/semantic-trees/2.1.118/src',
)
const laterRoot = path.join(
  repositoryRoot,
  '.recovery-tmp/semantic-trees/2.1.119/src',
)
const fixturePath = path.join(
  repositoryRoot,
  'recovery/test/recovery-2.1.118-strict-transitive-owner-proofs.json',
)
const analysisPath = path.join(
  repositoryRoot,
  'recovery/test/recovery-2.1.118-owner-residue-analysis.json',
)
const reportPath = path.join(
  repositoryRoot,
  '.recovery-tmp/residue-audits/2.1.117-to-2.1.118.typed-audit.json',
)
const structuralPath = path.join(
  repositoryRoot,
  'recovery/cases/2.1.117-to-2.1.118/structural/generated-delta.json.gz',
)
const replayHelperPath = path.join(
  repositoryRoot,
  'recovery/cases/2.1.117-to-2.1.118/recovered/replay-strict-transitive-source-gaps.mjs',
)
const baselineBundlePath = path.join(
  repositoryRoot,
  '.recovery-tmp/authenticated-artifacts/2.1.117-linux-x64/cli.inner.js',
)
const targetBundlePath = path.join(
  repositoryRoot,
  '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
)
const FROZEN_FIXTURE_SHA256 =
  '05be53b4766565d337a79f7a7de5bfdecdcc0d69d170c0211ced8c81f9cd23ca'
const POST_CORRECTION_SCANNER = {
  units: 11,
  residues: 36,
  sha256: 'a81cb226b96d5ab0b19a1559df391089376a549b69bed410369faa2206312304',
}

const PROOFS = [
  [4025, 'services/api/workloadIdentity.ts', 'FunctionDeclaration', 'getWIFAuthType'],
  [4684, 'services/api/workloadIdentity.ts', 'FunctionDeclaration', 'withCredentialsLock'],
  [4685, 'services/api/workloadIdentity.ts', 'FunctionDeclaration', 'acquireCredentialsLock'],
  [4690, 'services/api/workloadIdentity.ts', 'FunctionDeclaration', 'getWIFCredentials'],
  [4693, 'services/api/workloadIdentity.ts', 'SourceFile', null],
  [6726, 'utils/customThemes.ts', 'FunctionDeclaration', 'parseThemeJson'],
  [6727, 'utils/customThemes.ts', 'FunctionDeclaration', 'readThemeFile'],
  [6728, 'utils/customThemes.ts', 'FunctionDeclaration', 'loadThemePath'],
  [7750, 'hooks/useTextInput.ts', 'FunctionDeclaration', 'useTextInput'],
  [7799, 'keybindings/keybindingsDom.ts', 'FunctionDeclaration', 'isKeybindingsDomEnabled'],
  [8187, 'utils/frontmatterShadowValidation.ts', 'FunctionDeclaration', 'shadowValidateFrontmatter'],
  [8189, 'utils/frontmatterShadowValidation.ts', 'SourceFile', null],
  [8873, 'services/api/promptCacheBreakDetection.ts', 'FunctionDeclaration', 'recordPromptState'],
  [8874, 'services/api/promptCacheBreakDetection.ts', 'FunctionDeclaration', 'checkResponseForCacheBreak'],
  [11446, 'commands/logout/logout.tsx', 'FunctionDeclaration', 'performLogout'],
  [11676, 'utils/status.tsx', 'FunctionDeclaration', 'buildSettingSourcesProperties'],
  [12283, 'components/design-system/Label.tsx', 'FunctionDeclaration', 'Label'],
  [13293, 'tools/REPLTool/transpile.ts', 'FunctionDeclaration', 'rejectModuleLoading'],
  [13332, 'tools/REPLTool/vm.ts', 'FunctionDeclaration', 'installHelperShorthands'],
  [13767, 'utils/swarm/teammatePromptAddendum.ts', 'VariableDeclaration', 'TEAMMATE_SYSTEM_PROMPT_ADDENDUM'],
  [15187, 'bridge/sessionSubscriptions.ts', 'FunctionDeclaration', 'updateSlackThreadSubscription'],
  [15194, 'commands/autofix-pr/autofix-pr.tsx', 'FunctionDeclaration', 'AutofixPr'],
  [15197, 'commands/autofix-pr/autofix-pr.tsx', 'VariableDeclaration', 'STATUS_MESSAGES'],
  [15408, 'components/design-system/Tabs.tsx', 'FunctionDeclaration', 'TabHeader', 'stale'],
  [15795, 'daemon/jobs.ts', 'VariableDeclaration', 'JobStateSchema'],
  [15800, 'daemon/protocol.ts', 'SourceFile', null],
  [16268, 'commands/plugin/TagPlugin.tsx', 'VariableDeclaration', 'PLUGIN_TAG_USAGE'],
  [16620, 'components/WarmResumeHint.tsx', 'FunctionDeclaration', 'isConfigEligible'],
  [16629, 'components/WarmResumeHint.tsx', 'VariableDeclaration', 'WARM_RESUME_GATE'],
  [17034, 'components/design-system/FuzzyPicker.tsx', 'FunctionDeclaration', 'List'],
  [17040, 'components/CustomThemeEditor.tsx', 'FunctionDeclaration', 'CustomThemeEditor'],
  [17268, 'components/agents/AgentDetail.tsx', 'FunctionDeclaration', 'AgentDetail', 'stale'],
  [17272, 'components/agents/ColorPicker.tsx', 'FunctionDeclaration', 'ColorPicker', 'stale'],
  [17377, 'components/agents/AgentsMenu.tsx', 'FunctionDeclaration', 'AgentsMenu'],
  [17588, 'tasks/pillLabel.ts', 'FunctionDeclaration', 'getBackgroundTaskSummary'],
  [17606, 'commands/update/update.ts', 'VariableDeclaration', 'call'],
  [17680, 'commands/pro-trial-expired/pro-trial-expired.tsx', 'FunctionDeclaration', 'ProTrialExpired'],
  [17689, 'commands/pro-trial-expired/index.ts', 'VariableDeclaration', 'proTrialExpired'],
  [17756, 'hooks/useRemoteControlIdleUpsell.tsx', 'FunctionDeclaration', 'shouldShowPushNotificationIdleUpsell'],
  [17850, 'commands/recap/recap.ts', 'VariableDeclaration', 'call'],
  [18239, 'utils/hooks/execMcpToolHook.ts', 'FunctionDeclaration', 'interpolate'],
  [18240, 'utils/hooks/execMcpToolHook.ts', 'FunctionDeclaration', 'execMcpToolHook'],
  [18318, 'utils/hooks.ts', 'FunctionDeclaration', 'executeHooks'],
  [18320, 'utils/hooks.ts', 'FunctionDeclaration', 'executeHooksOutsideREPL'],
  [18865, 'components/permissions/AskUserQuestionPermissionRequest/QuestionNavigationBar.tsx', 'FunctionDeclaration', 'QuestionNavigationBar', 'stale'],
  [19778, 'utils/plugins/loadPluginThemes.ts', 'FunctionDeclaration', 'loadPluginThemes'],
  [19870, 'utils/cliArgs.ts', 'VariableDeclaration', 'CLI_FLAGS_WITH_VALUES', 'stale'],
  [19938, 'components/FeedbackSurvey/FeedbackSurveyView.tsx', 'SourceFile', null, 'stale'],
  [19951, 'components/FeedbackSurvey/FeedbackSurvey.tsx', 'VariableDeclaration', 'RESPONSE_LABELS', 'stale'],
  [20018, 'hooks/useRemoteControlIdleUpsell.tsx', 'FunctionDeclaration', 'useRemoteControlIdleUpsell'],
  [20019, 'hooks/useRemoteControlIdleUpsell.tsx', 'SourceFile', null],
  [20228, 'utils/terminalProbe.ts', 'FunctionDeclaration', 'logTerminalProbe'],
  [20229, 'utils/terminalProbe.ts', 'FunctionDeclaration', 'logTerminalProbe'],
  [20582, 'skills/bundled/claude-api/python/claude-api/batches.md', 'Resource', null],
  [20584, 'skills/bundled/claude-api/python/claude-api/files-api.md', 'Resource', null],
  [20586, 'skills/bundled/claude-api/python/claude-api/README.md', 'Resource', null],
  [20588, 'skills/bundled/claude-api/python/claude-api/streaming.md', 'Resource', null],
  [20596, 'skills/bundled/claude-api/SKILL.md', 'Resource', null],
  [20600, 'skills/bundled/claude-api/shared/anthropic-cli.md', 'Resource', null],
  [20610, 'skills/bundled/claude-api/shared/managed-agents-core.md', 'Resource', null],
  [20616, 'skills/bundled/claude-api/shared/managed-agents-onboarding.md', 'Resource', null],
  [20618, 'skills/bundled/claude-api/shared/managed-agents-overview.md', 'Resource', null],
  [20841, 'cli/print.ts', 'FunctionDeclaration', 'handleInitializeRequest'],
  [20901, 'commands/install.tsx', 'VariableDeclaration', 'install'],
  [20984, 'entrypoints/cli.tsx', 'FunctionDeclaration', 'main', 'later'],
].map(([targetIndex, owner, kind, name, status = 'historical']) => ({
  targetIndex,
  owner,
  kind,
  name,
  status,
}))

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function publicTreeSummary(summary) {
  return {
    files: summary.files,
    bytes: summary.bytes,
    manifestSha256: summary.manifestSha256,
  }
}

function canonicalFlags(flags) {
  return [...flags].sort().join('')
}

function identity(kind, value) {
  const canonicalValue =
    kind === 'regexp'
      ? { pattern: value.pattern, flags: canonicalFlags(value.flags) }
      : value
  return JSON.stringify([kind, canonicalValue])
}

function parseRegExp(text) {
  if (!text.startsWith('/')) return null
  let escaped = false
  let inClass = false
  for (let index = 1; index < text.length; index += 1) {
    const character = text[index]
    if (escaped) {
      escaped = false
    } else if (character === '\\') {
      escaped = true
    } else if (character === '[') {
      inClass = true
    } else if (character === ']' && inClass) {
      inClass = false
    } else if (character === '/' && !inClass) {
      return {
        pattern: text.slice(1, index),
        flags: canonicalFlags(text.slice(index + 1)),
      }
    }
  }
  return null
}

function declarationName(ts, node) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text
  if (node.name && ts.isStringLiteralLike(node.name)) return node.name.text
  return undefined
}

function collectSourceIdentities(ts, scope, sourceFile) {
  const identities = new Map()
  function add(kind, value, node) {
    const key = identity(kind, value)
    const kinds = identities.get(key) ?? new Set()
    kinds.add(ts.SyntaxKind[node.kind])
    identities.set(key, kinds)
  }
  function visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
      add('string', node.text, node)
    } else if (ts.isJsxText(node)) {
      const text = node.getText(sourceFile)
      if (text) add('string', text, node)
    } else if (ts.isNumericLiteral(node)) {
      add('number', String(Number(node.text.replaceAll('_', ''))), node)
    } else if (ts.isRegularExpressionLiteral(node)) {
      const value = parseRegExp(node.getText(sourceFile))
      if (value) add('regexp', value, node)
    }
    const property =
      ((ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isPropertySignature(node) ||
        ts.isMethodSignature(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node) ||
        ts.isBindingElement(node) ||
        ts.isJsxAttribute(node) ||
        ts.isImportSpecifier(node)) &&
        node.name &&
        ts.isIdentifier(node.name)) ||
      (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name))
        ? node.name.text
        : undefined
    if (property !== undefined) add('property', property, node)
    ts.forEachChild(node, visit)
  }
  visit(scope)
  return identities
}

async function loadTypeScript() {
  const filename = path.join(
    repositoryRoot,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function sourceAudit(ts, root, proof, residues, suppliedBytes = null) {
  const filename = path.join(root, proof.owner)
  const bytes = suppliedBytes ?? fs.readFileSync(filename)
  if (proof.kind === 'Resource') {
    return {
      file: descriptor(bytes),
      scope: null,
      declarationMatches: 0,
      coveredResidues: residues.filter(
        residue =>
          residue.kind === 'string' &&
          residue.value === bytes.toString('utf8'),
      ).length,
      residueRoles: residues.map(residue => ({
        identitySha256: residue.identitySha256,
        nodeKinds:
          residue.kind === 'string' &&
          residue.value === bytes.toString('utf8')
            ? ['ExactResourceBytes']
            : [],
      })),
    }
  }
  const source = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  if (sourceFile.parseDiagnostics.length !== 0) {
    throw new Error(`${proof.owner}: TypeScript parse diagnostics`)
  }
  const matches = []
  if (proof.kind === 'SourceFile') {
    matches.push(sourceFile)
  } else {
    function find(node) {
      if (
        ts.SyntaxKind[node.kind] === proof.kind &&
        declarationName(ts, node) === proof.name
      ) {
        matches.push(node)
      }
      ts.forEachChild(node, find)
    }
    find(sourceFile)
  }
  const scope = matches.length === 1 ? matches[0] : null
  const identities = scope
    ? collectSourceIdentities(ts, scope, sourceFile)
    : new Map()
  const scopeText = scope
    ? source.slice(scope.getStart(sourceFile), scope.end)
    : undefined
  const residueRoles = residues.map(residue => ({
    identitySha256: residue.identitySha256,
    nodeKinds: [...(identities.get(identity(residue.kind, residue.value)) ?? [])].sort(),
  }))
  return {
    file: descriptor(bytes),
    scope: scope
      ? {
          start: scope.getStart(sourceFile),
          end: scope.end,
          ...descriptor(Buffer.from(scopeText)),
        }
      : null,
    declarationMatches: matches.length,
    coveredResidues: residueRoles.filter(role => role.nodeKinds.length > 0)
      .length,
    residueRoles,
  }
}

function collectTargetIdentities(unit) {
  const ast = parse(unit, { ecmaVersion: 'latest', sourceType: 'module' })
  const identities = new Set()
  function walk(node) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) walk(child)
      return
    }
    if (node.type === 'Literal') {
      if (node.regex) {
        identities.add(
          identity('regexp', {
            pattern: node.regex.pattern,
            flags: canonicalFlags(node.regex.flags),
          }),
        )
      } else if (typeof node.value === 'string') {
        identities.add(identity('string', node.value))
      } else if (typeof node.value === 'number') {
        identities.add(identity('number', String(node.value)))
      }
    } else if (node.type === 'TemplateElement') {
      identities.add(identity('string', node.value?.cooked ?? node.value?.raw))
    }
    const property =
      ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(
        node.type,
      ) &&
      node.computed === false &&
      node.key?.type === 'Identifier'
        ? node.key.name
        : node.type === 'MemberExpression' &&
            node.computed === false &&
            node.property?.type === 'Identifier'
          ? node.property.name
          : undefined
    if (property !== undefined) identities.add(identity('property', property))
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
        walk(child)
      }
    }
  }
  walk(ast)
  return { ast, identities }
}

function normalizeResidue(row) {
  return {
    kind: row.literalKind,
    value: row.value,
    identitySha256: sha256(Buffer.from(identity(row.literalKind, row.value))),
    start: row.target.start,
    end: row.target.end,
    baselineCount: row.baselineOccurrenceCount,
    targetOrdinal: row.targetOccurrenceNumber,
  }
}

const analysis = JSON.parse(fs.readFileSync(analysisPath))
const frozen = analysis.analysis.sourceGapReplay.transitiveExactConsensus
const report = JSON.parse(fs.readFileSync(reportPath))
const frozenFixtureBytes = fs.readFileSync(fixturePath)
if (sha256(frozenFixtureBytes) !== FROZEN_FIXTURE_SHA256) {
  throw new Error('frozen pre-correction fixture identity mismatch')
}
const frozenFixture = JSON.parse(frozenFixtureBytes)
const structuralBytes = fs.readFileSync(structuralPath)
const structural = JSON.parse(gunzipSync(structuralBytes))
const regions = new Map(
  structural.regions.map(region => [region.target.index, region]),
)
const baselineBundle = fs.readFileSync(baselineBundlePath)
const targetBundle = fs.readFileSync(targetBundlePath)
const targetText = targetBundle.toString('utf8')
const ts = await loadTypeScript()
const macroValues = new Set(Object.values(analysis.macro))
const recoveredFiles = constructTarget118StrictTransitiveFiles({
  sourceRoot: historicalRoot,
})

const proofIndices = new Set(PROOFS.map(proof => proof.targetIndex))
const liveProofRows = report.sourceRuntimeAddedOwnerResidueRows.filter(row =>
  proofIndices.has(row.structural.index),
)
const indexedIdentity = row => ({
  targetIndex: row.structural.index,
  kind: row.literalKind,
  value: row.value,
  start: row.target.start,
  end: row.target.end,
  targetOrdinal: row.targetOccurrenceNumber,
})
const liveProofIdentities = liveProofRows.map(indexedIdentity)
const pinnedProofIdentities = frozenFixture.rows.flatMap(row =>
  row.residues.map(residue => ({
    targetIndex: row.targetIndex,
    kind: residue.kind,
    value: residue.value,
    start: residue.start,
    end: residue.end,
    targetOrdinal: residue.targetOrdinal,
  })),
)
const preCorrectionReport =
  liveProofIdentities.length === frozenFixture.summary.residues &&
  JSON.stringify(liveProofIdentities) === JSON.stringify(pinnedProofIdentities)
const postCorrectionReport =
  new Set(liveProofIdentities.map(row => row.targetIndex)).size ===
    POST_CORRECTION_SCANNER.units &&
  liveProofIdentities.length === POST_CORRECTION_SCANNER.residues &&
  sha256(Buffer.from(JSON.stringify(liveProofIdentities))) ===
    POST_CORRECTION_SCANNER.sha256
if (!preCorrectionReport && !postCorrectionReport) {
  throw new Error(
    'strict proof scanner rows are neither the frozen pre-correction universe nor the exact post-correction residual',
  )
}
const frozenRowsByIndex = new Map(
  frozenFixture.rows.map(row => [row.targetIndex, row]),
)

if (
  JSON.stringify(PROOFS.map(row => row.targetIndex)) !==
  JSON.stringify(frozen.targetIndices)
) {
  throw new Error('curated proof indices do not equal the frozen 65-unit set')
}
if (
  JSON.stringify(
    TARGET118_STRICT_TRANSITIVE_OWNER_OVERRIDES.map(override => [
      override.targetIndex,
      override.paths[0],
    ]),
  ) !==
  JSON.stringify(
    PROOFS.map(proof => [proof.targetIndex, `src/${proof.owner}`]),
  )
) {
  throw new Error('owner overrides do not equal the curated 65-unit map')
}

const mappingByIndex = new Map(
  frozen.mappings.map(mapping => [mapping.targetIndex, mapping]),
)
const rows = PROOFS.map(proof => {
  const region = regions.get(proof.targetIndex)
  if (!region) throw new Error(`u${proof.targetIndex}: structural region absent`)
  const reportRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
    row => row.structural.index === proof.targetIndex,
  )
  const residues = preCorrectionReport
    ? reportRows.map(normalizeResidue)
    : frozenRowsByIndex.get(proof.targetIndex).residues
  const unit = targetText.slice(region.target.start, region.target.end)
  if (sha256(unit) !== region.target.sourceHash) {
    throw new Error(`u${proof.targetIndex}: target unit identity mismatch`)
  }
  const targetSyntax = collectTargetIdentities(unit)
  const historical = sourceAudit(ts, historicalRoot, proof, residues)
  const recovered =
    proof.status === 'stale'
      ? sourceAudit(
          ts,
          historicalRoot,
          proof,
          residues,
          recoveredFiles.get(`src/${proof.owner}`),
        )
      : null
  const later =
    proof.status === 'later' ? sourceAudit(ts, laterRoot, proof, residues) : null
  const moduleSource =
    proof.targetIndex === 20841 || proof.targetIndex === 20901
      ? sourceAudit(
          ts,
          historicalRoot,
          { ...proof, kind: 'SourceFile', name: null },
          residues,
        )
      : null
  const dependencySource =
    proof.targetIndex === 18318 || proof.targetIndex === 18320
      ? sourceAudit(
          ts,
          historicalRoot,
          {
            owner: 'utils/hooks/execMcpToolHook.ts',
            kind: 'FunctionDeclaration',
            name: 'execMcpToolHook',
          },
          residues,
        )
      : null
  const representations = residues.map((residue, index) => {
    const historicalKinds = historical.residueRoles[index].nodeKinds
    const recoveredKinds = recovered?.residueRoles[index].nodeKinds ?? []
    const laterKinds = later?.residueRoles[index].nodeKinds ?? []
    const moduleKinds = moduleSource?.residueRoles[index].nodeKinds ?? []
    const dependencyKinds =
      dependencySource?.residueRoles[index].nodeKinds ?? []
    let kind
    let nodeKinds = []
    if (historicalKinds.length > 0) {
      kind =
        proof.kind === 'Resource' ? 'exact-resource-bytes' : 'source-ast'
      nodeKinds = historicalKinds
    } else if (laterKinds.length > 0) {
      kind = 'later-source-ast'
      nodeKinds = laterKinds
    } else if (residue.kind === 'string' && macroValues.has(residue.value)) {
      kind = 'authenticated-build-macro'
    } else if (proof.status === 'stale' && recoveredKinds.length > 0) {
      kind = 'bounded-source-replay-source-ast'
      nodeKinds = recoveredKinds
    } else if (dependencyKinds.length > 0) {
      kind = 'declaration-referenced-dependency-source-ast'
      nodeKinds = dependencyKinds
    } else if (moduleKinds.length > 0) {
      kind = 'owner-module-source-ast'
      nodeKinds = moduleKinds
    } else if (
      proof.targetIndex === 17377 &&
      residue.kind === 'number' &&
      ['173', '193', '215', '217', '218'].includes(String(residue.value))
    ) {
      kind = 'react-compiler-cache-index'
    } else if (
      proof.targetIndex === 20901 &&
      ((residue.kind === 'string' && residue.value === 'path') ||
        (residue.kind === 'property' && residue.value === 'createElement'))
    ) {
      kind = 'jsx-or-runtime-import-lowering'
    } else if (
      proof.targetIndex === 20984 &&
      residue.kind === 'property' &&
      ['then', 'resolve'].includes(residue.value)
    ) {
      kind = 'dynamic-import-lowering'
    }
    if (kind === undefined) {
      throw new Error(
        `u${proof.targetIndex}: unclassified residue ` +
          `${identity(residue.kind, residue.value)}`,
      )
    }
    return { identitySha256: residue.identitySha256, kind, nodeKinds }
  })
  const mapping = mappingByIndex.get(proof.targetIndex)
  const rejectedHint =
    mapping.replaySourcePath === proof.owner
      ? null
      : {
          path: `src/${mapping.replaySourcePath}`,
          file: descriptor(
            fs.readFileSync(path.join(historicalRoot, mapping.replaySourcePath)),
          ),
        }
  return {
    targetIndex: proof.targetIndex,
    semanticOwner: `src/${proof.owner}`,
    proofKind:
      proof.kind === 'Resource'
        ? 'exact-resource-module'
        : proof.status === 'stale'
          ? 'bounded-source-replay-source-ast'
          : proof.status === 'later'
            ? 'later-exact-declaration-recovery'
            : proof.kind === 'SourceFile'
              ? 'exact-source-module'
              : 'exact-named-declaration',
    declaration: { kind: proof.kind, name: proof.name },
    target: {
      classification: region.classification,
      nodeType: region.target.nodeType,
      start: region.target.start,
      end: region.target.end,
      bytes: region.target.end - region.target.start,
      tokenCount: region.target.tokenCount,
      sourceHash: region.target.sourceHash,
      coarseHash: region.target.coarseHash,
    },
    targetIdentitySignature: {
      identities: targetSyntax.identities.size,
      sha256: sha256(
        Buffer.from(JSON.stringify([...targetSyntax.identities].sort())),
      ),
    },
    literalConsensusHint: `src/${mapping.replaySourcePath}`,
    provisionalOwnerPaths: mapping.currentOwnerPaths.map(owner => `src/${owner}`),
    coverageBeforeStrictProof: {
      disposition: 'source-runtime-covered',
      ownerPaths: mapping.currentOwnerPaths.map(owner => `src/${owner}`),
      evidenceIds: ['source-map-attribution', 'semantic-test'],
    },
    rejectedLiteralConsensusHint: rejectedHint,
    residues,
    residueIdentitiesSha256: sha256(Buffer.from(JSON.stringify(residues))),
    historicalSource: historical,
    recoveredSource: recovered,
    laterSource: later,
    moduleSource,
    dependencySource,
    representations,
  }
})

const counts = Object.fromEntries(
  [...new Set(rows.map(row => row.proofKind))]
    .sort()
    .map(kind => [kind, rows.filter(row => row.proofKind === kind).length]),
)
const fixture = {
  schemaVersion: 1,
  case: '2.1.117-to-2.1.118',
  criterion: 'target118-frozen-transitive-whole-unit-source-ast-v1',
  status: 'strict-owner-proof-with-bounded-source-replay-tail',
  evidenceIds: [
    'target118-strict-transitive-owner-target-fragment',
    'target118-strict-transitive-owner-source-ast-test',
  ],
  inputs: {
    baselineBundle: {
      artifact: '2.1.117-linux-x64/cli.inner.js',
      ...descriptor(baselineBundle),
    },
    targetBundle: {
      artifact: '2.1.118-linux-x64/cli.inner.js',
      ...descriptor(targetBundle),
    },
    structural: {
      path:
        'recovery/cases/2.1.117-to-2.1.118/structural/generated-delta.json.gz',
      ...descriptor(structuralBytes),
    },
    replayHelper: {
      path:
        'recovery/cases/2.1.117-to-2.1.118/recovered/replay-strict-transitive-source-gaps.mjs',
      ...descriptor(fs.readFileSync(replayHelperPath)),
    },
    historicalSourceTree: publicTreeSummary(
      summarizeSourceTree(historicalRoot),
    ),
    laterSourceTree: publicTreeSummary(summarizeSourceTree(laterRoot)),
    laterSourceOverlay: {
      path:
        'recovery/cases/2.1.118-to-2.1.119/recovered/source-facing-overlay.patch',
      ...descriptor(
        fs.readFileSync(
          path.join(
            repositoryRoot,
            'recovery/cases/2.1.118-to-2.1.119/recovered/source-facing-overlay.patch',
          ),
        ),
      ),
    },
  },
  frozenUniverse: {
    units: frozen.units,
    residues: frozen.residues,
    unsupportedResidues: frozen.unsupportedResidues,
    targetIndices: frozen.targetIndices,
    targetIndicesSha256: frozen.targetIndicesSha256,
    residueIdentitiesSha256: frozen.residueIdentitiesSha256,
    unsupportedResidueIdentitiesSha256:
      frozen.unsupportedResidueIdentitiesSha256,
  },
  summary: {
    units: rows.length,
    residues: rows.reduce((sum, row) => sum + row.residues.length, 0),
    proofKinds: counts,
    rejectedIncidentalLiteralConsensusHints: rows.filter(
      row => row.rejectedLiteralConsensusHint !== null,
    ).length,
    historicalResiduesCovered: rows.reduce(
      (sum, row) => sum + row.historicalSource.coveredResidues,
      0,
    ),
    laterRecoveredResidues: rows.reduce(
      (sum, row) => sum + (row.laterSource?.coveredResidues ?? 0),
      0,
    ),
    representations: Object.fromEntries(
      [
        ...new Set(
          rows.flatMap(row => row.representations.map(item => item.kind)),
        ),
      ]
        .sort()
        .map(kind => [
          kind,
          rows
            .flatMap(row => row.representations)
            .filter(item => item.kind === kind).length,
        ]),
    ),
  },
  boundedReplayTail: rows
    .filter(row => row.proofKind === 'bounded-source-replay-source-ast')
    .map(row => ({
      targetIndex: row.targetIndex,
      semanticOwner: row.semanticOwner,
      declaration: row.declaration,
      missingResidueIdentitySha256s: row.historicalSource.residueRoles
        .filter(role => role.nodeKinds.length === 0)
        .map(role => role.identitySha256),
      recoveredResidueIdentitySha256s: row.recoveredSource.residueRoles
        .filter(role => role.nodeKinds.length > 0)
        .map(role => role.identitySha256),
    })),
  boundedReplay: {
    rawSourceTree: TARGET118_STRICT_TRANSITIVE_RAW_SOURCE_TREE,
    recoveredSourceTree: TARGET118_STRICT_TRANSITIVE_RECOVERED_SOURCE_TREE,
    inputFiles: TARGET118_STRICT_TRANSITIVE_INPUT_FILES,
    recoveredFiles: TARGET118_STRICT_TRANSITIVE_RECOVERED_SOURCE_FILES,
    overrides: TARGET118_STRICT_TRANSITIVE_SOURCE_GAP_OVERRIDES,
  },
  ownerOverrides: TARGET118_STRICT_TRANSITIVE_OWNER_OVERRIDES,
  rows,
}

const serialized = `${JSON.stringify(fixture, null, 2)}\n`
if (process.argv.includes('--write')) {
  fs.writeFileSync(fixturePath, serialized)
} else {
  process.stdout.write(serialized)
}

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.116-safe-residual-proofs.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const structuralPath = path.join(
  repositoryRoot,
  'recovery/cases',
  caseName,
  'structural/generated-delta.json.gz',
)
const structuralBytes = fs.readFileSync(structuralPath)
const structural = JSON.parse(gunzipSync(structuralBytes))

const FIXTURE_SHA256 =
  'da7e4c022200314293dbc6208af24ebc85d8622f3c1f16022f17dd08cf5b2af4'
const ADMITTED_TARGETS = [
  6694, 8167, 13225, 13680, 13688, 13804, 13869, 14099, 14142, 14214,
  16278, 16855, 16965, 16966, 17447, 18000, 18654, 19071, 19121, 19751,
  20615,
]
const INPUT_TARGETS = [
  6059, 6063, 6072, 6073, 6074, 6694, 8146, 8150, 8151, 8152, 8167,
  8843, 10175, 10177, 12604, 13225, 13680, 13688, 13804, 13869, 14099,
  14142, 14214, 14795, 15168, 15241, 15286, 15708, 15709, 16049, 16278,
  16436, 16437, 16459, 16513, 16586, 16855, 16965, 16966, 17054, 17056,
  17211, 17218, 17219, 17276, 17410, 17447, 18000, 18171, 18181, 18589,
  18596, 18654, 19071, 19121, 19158, 19221, 19224, 19681, 19684, 19706,
  19714, 19751, 20099, 20130, 20580, 20615, 20696, 20697, 20698, 20703,
  20732,
]
const SOURCE_GAP_OR_RESERVED_TARGETS = [
  6059, 6063, 6072, 6073, 6074, 8146, 8150, 8151, 8152, 8843, 10175,
  10177, 12604, 14795, 15168, 15241, 15286, 15708, 15709, 16049, 16436,
  16437, 16459, 16513, 16586, 17054, 17056, 17211, 17218, 17219, 17276,
  17410, 18171, 18181, 18589, 18596, 19158, 19221, 19224, 19681, 19684,
  19706, 19714, 20130, 20696, 20697, 20698, 20703, 20732,
]
const CATEGORY_PROOFS = new Map([
  ['arithmetic-constant-folding', new Set(['arithmetic-fold'])],
  ['component-extraction', new Set(['component-extraction'])],
  ['context-getter-lowering', new Set(['context-getter-lowering'])],
  ['direct-authored-source', new Set(['exact-source'])],
  ['exact-owner-correction', new Set(['exact-owner-source'])],
  [
    'mixed-mcp-representation',
    new Set(['build-macro', 'compiler-boolean', 'exact-source']),
  ],
  [
    'mixed-update-representation',
    new Set(['build-macro', 'exact-owner-source']),
  ],
  ['model-family-truth-table', new Set(['model-family-truth-table'])],
  ['task-registry-lowering', new Set(['task-registry-lowering'])],
  ['transitive-dead-code', new Set(['transitive-dce'])],
])

const SOURCE_PROOFS = new Map([
  [
    6694,
    {
      'src/ink/terminal-querier.ts': [
        'export function decrqm(mode: number)',
        'request: csi(`?${mode}$p`)',
        "r.type === 'decrpm' && r.mode === mode",
      ],
    },
  ],
  [
    8167,
    {
      'src/utils/effort.ts': [
        'export function getDefaultEffortForModel(',
        "getCanonicalName(model).includes('opus-4-7')",
        "model.toLowerCase().includes('opus-4-6')",
        "return 'xhigh'",
        "return 'medium'",
      ],
    },
  ],
  [
    13225,
    {
      'src/tools/WebSearchTool/WebSearchTool.ts': [
        'const appState = context.getAppState()',
        'effortValue: appState.effortValue',
      ],
      'src/utils/queryContext.ts': [
        'getEffortValue: () => getAppState().effortValue',
      ],
    },
  ],
  [
    13680,
    {
      'src/query.ts': [
        'fastMode: appState.fastMode',
        'effortValue: appState.effortValue',
      ],
      'src/utils/queryContext.ts': [
        'getAutoCompactWindow: () => getAppState().autoCompactWindow',
        'getFastMode: () => getAppState().fastMode',
        'getEffortValue: () => getAppState().effortValue',
      ],
    },
  ],
  [
    13688,
    {
      'src/tools/AgentTool/runAgent.ts': [
        'onQueryProgress?.()',
        'const state = toolUseContext.getAppState()',
        'state.toolPermissionContext',
        'state.effortValue',
      ],
      'src/utils/queryContext.ts': [
        'getToolPermissionContext: () => getAppState().toolPermissionContext',
        'getEffortValue: () => getAppState().effortValue',
      ],
    },
  ],
  [
    13804,
    {
      'src/utils/attachments.ts': [
        'const appState = toolUseContext.getAppState()',
        'const permissionContext = appState.toolPermissionContext',
      ],
      'src/utils/queryContext.ts': [
        'getToolPermissionContext: () => getAppState().toolPermissionContext',
      ],
    },
  ],
  [
    13869,
    {
      'src/utils/plugins/loadPluginCommands.ts': [
        'getAppState() {',
        'const appState = context.getAppState()',
        '...appState.toolPermissionContext',
      ],
      'src/utils/queryContext.ts': [
        'getToolPermissionContext: () => getAppState().toolPermissionContext',
      ],
    },
  ],
  [
    14099,
    {
      'src/tools/PowerShellTool/powershellPermissions.ts': [
        'const toolPermissionContext = context.getAppState().toolPermissionContext',
      ],
      'src/utils/queryContext.ts': [
        'getToolPermissionContext: () => getAppState().toolPermissionContext',
      ],
    },
  ],
  [
    14142,
    {
      'src/skills/loadSkillsDir.ts': [
        'getAppState() {',
        'const appState = toolUseContext.getAppState()',
        '...appState.toolPermissionContext',
      ],
      'src/utils/queryContext.ts': [
        'getToolPermissionContext: () => getAppState().toolPermissionContext',
      ],
    },
  ],
  [
    14214,
    {
      'src/services/compact/compact.ts': [
        'const appState = context.getAppState()',
        'effortValue: appState.effortValue',
      ],
      'src/utils/queryContext.ts': [
        'getEffortValue: () => getAppState().effortValue',
      ],
    },
  ],
  [
    16855,
    {
      'src/commands/security-review.ts': [
        'getAppState() {',
        'const appState = context.getAppState()',
        '...appState.toolPermissionContext',
      ],
      'src/utils/queryContext.ts': [
        'getToolPermissionContext: () => getAppState().toolPermissionContext',
      ],
    },
  ],
  [
    16965,
    {
      'src/components/Passes/Passes.tsx': [
        'const renderTicket = (pass: PassStatus)',
        '.map(pass_0 => renderTicket(pass_0))',
      ],
    },
  ],
  [
    16966,
    {
      'src/components/Passes/Passes.tsx': [
        'const renderTicket = (pass: PassStatus)',
        'pass.isAvailable',
        'key={pass.passNumber}',
      ],
    },
  ],
  [
    17447,
    {
      'src/commands/update/update.ts': [
        'Cannot /update — this session was resumed from a different project directory. Restart manually with --resume to continue on the latest version.',
      ],
    },
  ],
  [
    18000,
    {
      'src/utils/hooks/execAgentHook.ts': [
        'getAppState() {',
        'const appState = toolUseContext.getAppState()',
        '...appState.toolPermissionContext',
      ],
      'src/utils/queryContext.ts': [
        'getToolPermissionContext: () => getAppState().toolPermissionContext',
      ],
    },
  ],
  [
    18654,
    {
      'src/components/permissions/AskUserQuestionPermissionRequest/SubmitQuestionsView.tsx': [
        'You have not answered all questions',
        '!allQuestionsAnswered',
      ],
    },
  ],
  [
    19071,
    {
      'src/hooks/useTypeahead.tsx': [
        'for (const { client, templates } of fetched)',
        '[client.name]: templates',
      ],
    },
  ],
  [
    19121,
    {
      'src/components/CoordinatorAgentStatus.tsx': [
        "import { evictTerminalTask } from '../utils/task/framework.js'",
        'evictTerminalTask(t.id, setAppState_0)',
      ],
      'src/utils/task/framework.ts': [
        'export function evictTerminalTask(',
      ],
      'src/utils/queryContext.ts': [
        'taskRegistry: createTaskRegistry(getAppState, setAppState)',
      ],
    },
  ],
  [
    19751,
    {
      'src/services/tips/tipRegistry.ts': [
        'const daysSinceLastUse = config.lastPlanModeUse',
        '(1000 * 60 * 60 * 24)',
        'return daysSinceLastUse > 7',
      ],
    },
  ],
  [
    20615,
    {
      'src/entrypoints/mcp.ts': [
        'version: MACRO.VERSION',
        'async ({ params: { name, arguments: args } })',
        'getFastMode: () => false',
      ],
    },
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function identity(kind, value) {
  return `${kind}:${
    kind === 'string' || kind === 'property' ? JSON.stringify(value) : String(value)
  }`
}

function walk(node, ancestors, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, ancestors, visit)
    return
  }
  if (typeof node.type === 'string') visit(node, ancestors)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, [...ancestors, node], visit)
    }
  }
}

function collectOccurrences(source) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const occurrences = []
  walk(ast, [], (node, ancestors) => {
    if (node.type === 'Literal') {
      if (typeof node.value === 'string' || typeof node.value === 'number') {
        occurrences.push({
          ancestors,
          end: node.end,
          identity: identity(typeof node.value, node.value),
          node,
          start: node.start,
        })
      }
    } else if (node.type === 'TemplateElement') {
      const value = node.value?.cooked ?? node.value?.raw
      if (typeof value === 'string') {
        occurrences.push({
          ancestors,
          end: node.end,
          identity: identity('string', value),
          node,
          start: node.start,
        })
      }
    }

    const isProperty =
      (['Property', 'MethodDefinition', 'PropertyDefinition'].includes(
        node.type,
      ) &&
        node.computed === false &&
        node.key?.type === 'Identifier') ||
      (node.type === 'MemberExpression' &&
        node.computed === false &&
        node.property?.type === 'Identifier')
    if (isProperty) {
      const property = node.key ?? node.property
      occurrences.push({
        ancestors: [...ancestors, node],
        end: property.end,
        identity: identity('property', property.name),
        node: property,
        start: property.start,
      })
    }
  })
  occurrences.sort((left, right) => left.start - right.start)
  const grouped = new Map()
  for (const occurrence of occurrences) {
    const group = grouped.get(occurrence.identity) ?? []
    group.push(occurrence)
    grouped.set(occurrence.identity, group)
  }
  return { ast, grouped }
}

function objectFields(object) {
  return new Map(
    object.properties
      .filter(
        property =>
          property.type === 'Property' &&
          !property.computed &&
          property.value?.type === 'Literal',
      )
      .map(property => [
        property.key.name ?? property.key.value,
        property.value.value,
      ]),
  )
}

function assertBuildMacroOccurrence(occurrence, label) {
  const enclosing = occurrence.ancestors.filter(ancestor => {
    if (ancestor.type !== 'ObjectExpression') return false
    const fields = objectFields(ancestor)
    return (
      fields.get('VERSION') === '2.1.116' &&
      fields.get('BUILD_TIME') === '2026-04-20T13:57:26Z' &&
      fields.get('GIT_SHA') ===
        '9e176d0772418b8b88475d39fb86c651a12f4aad'
    )
  })
  assert.equal(enclosing.length, 1, `${label}: one enclosing build macro`)
}

function sourceFilename(owner) {
  const filename = path.join(sourceRoot, owner.replace(/^src\//, ''))
  assert.ok(fs.existsSync(filename), `${owner}: exists under ${sourceRoot}`)
  return filename
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

const sourceCache = new Map()

async function authenticatedSource(owner) {
  if (sourceCache.has(owner)) return sourceCache.get(owner)
  const filename = sourceFilename(owner)
  const contents = fs.readFileSync(filename, 'utf8')
  const ts = await loadTypeScript()
  const sourceFile = ts.createSourceFile(
    filename,
    contents,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${owner}: parses`)
  const result = { contents, sourceFile }
  sourceCache.set(owner, result)
  return result
}

test('the target116 safe-residual fixture is complete, disjoint, and fail-closed', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.equal(sha256(structuralBytes), fixture.artifact.structuralGzipSha256)
  assert.deepEqual(
    fixture.rows.map(row => row.targetIndex),
    ADMITTED_TARGETS,
  )
  assert.equal(fixture.summary.units, 21)
  assert.equal(fixture.summary.residues, 41)
  assert.equal(fixture.summary.excludedUnits, 51)

  const admitted = new Set(ADMITTED_TARGETS)
  const excluded = new Set(fixture.excludedUnsupportedTargetIndices)
  assert.equal(admitted.size, ADMITTED_TARGETS.length)
  assert.equal(excluded.size, fixture.excludedUnsupportedTargetIndices.length)
  assert.deepEqual(
    [...admitted, ...excluded].sort((left, right) => left - right),
    INPUT_TARGETS,
    'all 72 unsupported input units are decided exactly once',
  )
  for (const targetIndex of SOURCE_GAP_OR_RESERVED_TARGETS) {
    assert.ok(excluded.has(targetIndex), `${targetIndex}: source gap is excluded`)
    assert.ok(!admitted.has(targetIndex), `${targetIndex}: source gap is not admitted`)
  }

  let residueCount = 0
  for (const row of fixture.rows) {
    assert.ok(CATEGORY_PROOFS.has(row.category), `${row.targetIndex}: category`)
    assert.ok(SOURCE_PROOFS.has(row.targetIndex) || row.targetIndex === 16278)
    assert.deepEqual(
      Object.keys(SOURCE_PROOFS.get(row.targetIndex) ?? {}).sort(),
      [...row.evidenceOwners].sort(),
      `${row.targetIndex}: exact evidence owners`,
    )
    assert.ok(row.residues.length > 0, `${row.targetIndex}: residues`)
    residueCount += row.residues.length
    const proofs = new Set()
    for (const residue of row.residues) {
      assert.equal(residue.length, 7, `${row.targetIndex}: residue tuple`)
      const [kind, value, start, end, baselineCount, targetOrdinal, proof] =
        residue
      assert.ok(['number', 'property', 'string'].includes(kind))
      assert.notEqual(value, undefined)
      assert.ok(Number.isSafeInteger(start) && Number.isSafeInteger(end))
      assert.ok(end > start)
      assert.ok(Number.isSafeInteger(baselineCount) && baselineCount >= 0)
      assert.ok(targetOrdinal > baselineCount, `${row.targetIndex}: target-added`)
      assert.ok(start >= row.target[1] && end <= row.target[2])
      proofs.add(proof)
    }
    assert.deepEqual(
      proofs,
      CATEGORY_PROOFS.get(row.category),
      `${row.targetIndex}: complete category proof set`,
    )
  }
  assert.equal(residueCount, fixture.summary.residues)
})

test(
  'the selected source root proves every admitted authored representation',
  { skip: !selected ? `not applicable to ${semanticCase}` : false },
  async () => {
    const missingFragments = []
    for (const row of fixture.rows) {
      if (row.targetIndex === 16278) continue
      const sourceProof = SOURCE_PROOFS.get(row.targetIndex)
      assert.ok(sourceProof, `${row.targetIndex}: source proof`)
      for (const [owner, fragments] of Object.entries(sourceProof)) {
        const { contents } = await authenticatedSource(owner)
        for (const fragment of fragments) {
          if (!contents.includes(fragment)) {
            missingFragments.push(`${row.targetIndex}: ${owner}: ${fragment}`)
          }
        }
      }
    }
    assert.deepEqual(missingFragments, [], 'all temporal source fragments')

    const querySource = (await authenticatedSource('src/query.ts')).contents
    const currentAutoCompactRepresentation =
      'toolUseContext.getAppState().autoCompactWindow'
    if (querySource.includes(currentAutoCompactRepresentation)) {
      assert.ok(
        querySource.includes(currentAutoCompactRepresentation),
        'u13680: current root owns the direct AppState field representation',
      )
    } else {
      const queryContext = (
        await authenticatedSource('src/utils/queryContext.ts')
      ).contents
      assert.ok(
        queryContext.includes(
          'getAutoCompactWindow: () => getAppState().autoCompactWindow',
        ),
        'u13680: pre-dispatch root still pins the exact getter contract',
      )
    }

    const day = 1000 * 60 * 60 * 24
    assert.equal(day, 86_400_000, 'u19751 source arithmetic constant')

    const passes = (await authenticatedSource('src/components/Passes/Passes.tsx'))
      .contents
    assert.ok(
      passes.indexOf('const renderTicket = (pass: PassStatus)') <
        passes.indexOf('.map(pass_0 => renderTicket(pass_0))'),
      'u16965/u16966: the extracted target component follows its source closure',
    )

    const taskEvidence = (
      await Promise.all(
        [
          'src/utils/task/framework.ts',
          'src/utils/queryContext.ts',
        ].map(authenticatedSource),
      )
    )
      .map(result => result.contents)
      .join('\n')
    assert.ok(taskEvidence.includes('evictTerminal(taskId'))
    assert.ok(taskEvidence.includes('evictTerminalTask(taskId, setAppState)'))
  },
)

test(
  'authenticated inner114/inner116 bundles pin every residue and transform oracle',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.114 and 2.1.116 inner bundles are required'
        : false,
    timeout: 90_000,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(sha256(baselineBytes), fixture.artifact.baselineInnerSha256)
    assert.equal(sha256(targetBytes), fixture.artifact.targetInnerSha256)
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const baselineSyntax = collectOccurrences(baseline)
    const targetSyntax = collectOccurrences(target)

    for (const row of fixture.rows) {
      const region = structural.regions[row.targetIndex]
      assert.equal(region?.target?.index, row.targetIndex)
      assert.deepEqual(
        [
          region.classification,
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        row.target,
        `${row.targetIndex}: structural identity`,
      )
      const [, unitStart, unitEnd, nodeType, sourceHash] = row.target
      const targetUnit = target.slice(unitStart, unitEnd)
      assert.equal(sha256(targetUnit), sourceHash, `${row.targetIndex}: bytes`)
      const unitSyntax = collectOccurrences(targetUnit)
      assert.equal(unitSyntax.ast.body.length, 1, `${row.targetIndex}: one unit`)
      assert.equal(unitSyntax.ast.body[0].type, nodeType)

      for (const residue of row.residues) {
        const [kind, value, start, end, baselineCount, targetOrdinal, proof] =
          residue
        const residueIdentity = identity(kind, value)
        const baselineOccurrences = baselineSyntax.grouped.get(residueIdentity) ?? []
        const targetOccurrences = targetSyntax.grouped.get(residueIdentity) ?? []
        assert.equal(
          baselineOccurrences.length,
          baselineCount,
          `${row.targetIndex}: ${residueIdentity}: baseline count`,
        )
        const occurrence = targetOccurrences[targetOrdinal - 1]
        assert.ok(occurrence, `${row.targetIndex}: ${residueIdentity}: ordinal`)
        assert.deepEqual(
          [occurrence.start, occurrence.end],
          [start, end],
          `${row.targetIndex}: ${residueIdentity}: range`,
        )

        if (proof === 'build-macro') {
          assertBuildMacroOccurrence(
            occurrence,
            `${row.targetIndex}: ${residueIdentity}`,
          )
        } else if (proof === 'compiler-boolean') {
          const unary = occurrence.ancestors.at(-1)
          assert.equal(unary?.type, 'UnaryExpression')
          assert.equal(unary.operator, '!')
          assert.equal(unary.argument, occurrence.node)
        } else if (proof === 'context-getter-lowering') {
          const role = occurrence.ancestors.at(-1)
          const parent = occurrence.ancestors.at(-2)
          if (role?.type === 'MemberExpression') {
            assert.equal(role.property, occurrence.node)
            if (parent?.type === 'CallExpression') {
              assert.equal(parent.callee, role)
            } else {
              assert.equal(parent?.type, 'ConditionalExpression')
              assert.ok(
                [parent.test, parent.consequent, parent.alternate].includes(role),
              )
            }
          } else {
            assert.equal(role?.type, 'Property')
            assert.equal(role.key, occurrence.node)
            if (value === 'onQueryProgress') {
              assert.equal(parent?.type, 'ObjectPattern')
            } else {
              assert.ok(
                [
                  'ArrowFunctionExpression',
                  'FunctionExpression',
                  'Identifier',
                ].includes(
                  role.value?.type,
                ),
              )
            }
          }
        } else if (proof === 'task-registry-lowering') {
          const member = occurrence.ancestors.at(-1)
          const call = occurrence.ancestors.at(-2)
          assert.equal(member?.type, 'MemberExpression')
          assert.equal(call?.type, 'CallExpression')
          assert.equal(call.callee, member)
        } else if (proof === 'arithmetic-fold') {
          const division = occurrence.ancestors.at(-1)
          assert.equal(division?.type, 'BinaryExpression')
          assert.equal(division.operator, '/')
          assert.equal(division.right, occurrence.node)
        } else if (proof === 'model-family-truth-table') {
          const comparison = occurrence.ancestors.at(-1)
          assert.equal(comparison?.type, 'BinaryExpression')
          assert.equal(comparison.operator, '===')
        }
      }
    }

    const passCaller = fixture.rows.find(row => row.targetIndex === 16965)
    const passComponent = fixture.rows.find(row => row.targetIndex === 16966)
    const caller = target.slice(passCaller.target[1], passCaller.target[2])
    const component = target.slice(passComponent.target[1], passComponent.target[2])
    assert.match(caller, /createElement\([^,]+,\{key:[^,]+,pass:[^}]+\}\)/)
    assert.match(component, /\{pass:[^}]+\}=/)

    const dceRow = fixture.rows.find(row => row.targetIndex === 16278)
    const schemaUnit = target.slice(dceRow.target[1], dceRow.target[2])
    assert.ok(schemaUnit.includes('sock:N.string().optional()'))
    assert.equal((target.match(/N\$8/g) ?? []).length, 1, 'N$8 has only its declaration')
    assert.equal((target.match(/V\$8/g) ?? []).length, 1, 'V$8 has only its declaration')
    assert.equal((target.match(/UM6/g) ?? []).length, 2, 'UM6 is used only by dead V$8')
    assert.ok(
      target.includes('K=zN1().safeParse(c$($))'),
      'the schema is reachable only from declaration-only N$8',
    )
  },
)

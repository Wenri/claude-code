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
  new URL('./recovery-2.1.116-strict-tail-proofs.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const structuralBytes = fs.readFileSync(
  path.join(
    repositoryRoot,
    'recovery/cases',
    caseName,
    'structural/generated-delta.json.gz',
  ),
)
const structural = JSON.parse(gunzipSync(structuralBytes))

const FIXTURE_SHA256 =
  'e5ceab75fa88a96a2960c2af0d2f864da34b2c33286aed3446cecff270e93c52'
const TARGET_INDICES = [
  8843, 15168, 15708, 16049, 16436, 16437, 16459, 16513, 17054,
  17056, 17211, 17218, 17219, 17276, 17410, 19221, 19224, 19681,
  19706, 19714, 20130, 20696, 20697, 20698, 20703,
]
const UNSUPPORTED_INDICES = [
  8843, 15168, 15708, 16049, 16436, 16437, 16459, 16513, 17054,
  17056, 17211, 17218, 17219, 17276, 17410, 19221, 19224, 19681,
  19706, 19714, 20099, 20130, 20580, 20696, 20697, 20698, 20703,
]
const BUILD_VALUES = new Set([
  'string:"2.1.116"',
  'string:"2026-04-20T13:57:26Z"',
  'property:"GIT_SHA"',
  'string:"9e176d0772418b8b88475d39fb86c651a12f4aad"',
])
const ALLOWED_CATEGORY_PROOFS = new Map([
  ['build-metadata', new Set(['build-macro'])],
  ['compiler-authored-source', new Set(['compiler-runtime-import', 'jsx-fragment'])],
  ['component-extraction', new Set(['component-extraction'])],
  ['direct-authored-source', new Set(['exact-source'])],
  ['exact-owner-correction', new Set(['exact-source', 'runtime-import'])],
  ['mixed-build-platform', new Set(['build-macro', 'platform-fold'])],
  ['mixed-vim-compiler-cache', new Set(['exact-source', 'react-memo-cache'])],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function identity(kind, value) {
  return `${kind}:${
    kind === 'string' || kind === 'property'
      ? JSON.stringify(value)
      : String(value)
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

const sourceAuditCache = new Map()

async function sourceAudit(owner) {
  if (sourceAuditCache.has(owner)) return sourceAuditCache.get(owner)
  const ts = await loadTypeScript()
  const filename = sourceFilename(owner)
  const contents = fs.readFileSync(filename, 'utf8')
  const sourceFile = ts.createSourceFile(
    filename,
    contents,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${owner}: parses`)
  const identities = new Set()
  const imports = new Set()
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue
    const clause = statement.importClause
    if (clause.isTypeOnly) continue
    const named = clause.namedBindings
    if (named && ts.isNamedImports(named)) {
      for (const element of named.elements) {
        if (!element.isTypeOnly) {
          imports.add(element.propertyName?.text ?? element.name.text)
        }
      }
    }
  }

  function visit(node) {
    if (ts.isStringLiteralLike(node)) {
      identities.add(identity('string', node.text))
    } else if (
      [
        ts.SyntaxKind.TemplateHead,
        ts.SyntaxKind.TemplateMiddle,
        ts.SyntaxKind.TemplateTail,
      ].includes(node.kind)
    ) {
      identities.add(identity('string', node.text))
    } else if (ts.isNumericLiteral(node)) {
      identities.add(identity('number', Number(node.text)))
    } else if (node.kind === ts.SyntaxKind.JsxText) {
      const lines = node.text.split(/\r?\n/)
      for (let index = 0; index < lines.length; index++) {
        let line = lines[index].replace(/\t/g, ' ')
        if (index !== 0) line = line.replace(/^ +/, '')
        if (index !== lines.length - 1) line = line.replace(/ +$/, '')
        if (line) identities.add(identity('string', line))
      }
    }

    if (ts.isPropertyAccessExpression(node)) {
      identities.add(identity('property', node.name.text))
    } else if (
      (ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isPropertySignature(node) ||
        ts.isMethodSignature(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node) ||
        ts.isJsxAttribute(node) ||
        ts.isBindingElement(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      identities.add(identity('property', node.name.text))
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  const result = { contents, identities, imports }
  sourceAuditCache.set(owner, result)
  return result
}

test('target116 strict-tail fixture is complete and fail-closed', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.equal(sha256(structuralBytes), fixture.artifact.structuralGzipSha256)
  assert.deepEqual(fixture.rows.map(row => row.targetIndex), TARGET_INDICES)
  assert.deepEqual(
    fixture.derivation.unsupportedTargetIndices,
    UNSUPPORTED_INDICES,
  )
  assert.deepEqual(fixture.derivation.separatelyProvedTargetIndices, [20099, 20580])
  assert.deepEqual(fixture.derivation.currentScan, {
    targetAddedOwnerResidues: 947,
    targetAddedOwnerResidueUnits: 164,
  })
  assert.equal(
    fixture.derivation.unsupportedIdentitySha256,
    '0ab0e4339aeb6de76e37955bb12ba1dd948702fe5e89cfed16bf3ba1da1f8cba',
  )
  assert.deepEqual(fixture.summary, {
    categories: {
      'exact-owner-correction': { units: 14, residues: 47 },
      'build-metadata': { units: 4, residues: 108 },
      'mixed-build-platform': { units: 1, residues: 7 },
      'component-extraction': { units: 3, residues: 4 },
      'mixed-vim-compiler-cache': { units: 1, residues: 16 },
      'direct-authored-source': { units: 1, residues: 1 },
      'compiler-authored-source': { units: 1, residues: 3 },
    },
    proofs: {
      'exact-source': 55,
      'build-macro': 114,
      'platform-fold': 1,
      'component-extraction': 4,
      'react-memo-cache': 8,
      'compiler-runtime-import': 1,
      'jsx-fragment': 2,
      'runtime-import': 1,
    },
    units: 25,
    residues: 186,
    separatelyProvedUnits: 2,
    separatelyProvedResidues: 5,
  })

  let residueCount = 0
  for (const row of fixture.rows) {
    assert.ok(ALLOWED_CATEGORY_PROOFS.has(row.category), `${row.targetIndex}: category`)
    assert.ok(row.residues.length > 0, `${row.targetIndex}: residues`)
    residueCount += row.residues.length
    const proofs = new Set()
    for (const residue of row.residues) {
      assert.equal(residue.length, 7, `${row.targetIndex}: residue tuple`)
      const [kind, value, start, end, baselineCount, targetOrdinal, proof] = residue
      assert.ok(['number', 'property', 'string'].includes(kind))
      assert.notEqual(value, undefined)
      assert.ok(Number.isSafeInteger(start) && Number.isSafeInteger(end) && end > start)
      assert.ok(Number.isSafeInteger(baselineCount) && baselineCount >= 0)
      assert.ok(targetOrdinal > baselineCount, `${row.targetIndex}: target-added`)
      assert.ok(start >= row.target[1] && end <= row.target[2])
      proofs.add(proof)
    }
    const allowedProofs = ALLOWED_CATEGORY_PROOFS.get(row.category)
    assert.ok(
      [...proofs].every(proof => allowedProofs.has(proof)),
      `${row.targetIndex}: category proof subset`,
    )
    if (row.category !== 'exact-owner-correction') {
      assert.deepEqual(
        proofs,
        allowedProofs,
        `${row.targetIndex}: complete category oracle`,
      )
    }
  }
  assert.equal(residueCount, fixture.summary.residues)
})

test(
  'selected sources prove every strict-tail authored representation',
  { skip: !selected ? `not applicable to ${semanticCase}` : false },
  async () => {
    for (const row of fixture.rows) {
      for (const residue of row.residues) {
        const [kind, value, , , , , proof] = residue
        if (proof === 'exact-source') {
          for (const owner of row.evidenceOwners) {
            const audit = await sourceAudit(owner)
            assert.ok(
              audit.identities.has(identity(kind, value)),
              `${row.targetIndex}: ${owner}: exact ${identity(kind, value)}`,
            )
          }
        } else if (proof === 'runtime-import') {
          for (const owner of row.evidenceOwners) {
            const audit = await sourceAudit(owner)
            assert.ok(
              audit.imports.has(String(value)),
              `${row.targetIndex}: ${owner}: runtime import ${String(value)}`,
            )
          }
        }
      }
    }

    const doctor = await sourceAudit('src/screens/Doctor.tsx')
    assert.ok(doctor.contents.includes('{process.platform}-{process.arch}'))

    const agents = await sourceAudit('src/components/agents/RunningAgents.tsx')
    assert.ok(agents.contents.includes('const renderRunning ='))
    assert.ok(agents.contents.includes('const renderCompleted ='))
    assert.equal(
      (agents.contents.match(/const selected = task\.id === selectedTask\?\.id/g) ?? [])
        .length,
      2,
    )
    assert.ok(agents.contents.includes('running.map(renderRunning)'))
    assert.ok(agents.contents.includes('recentlyCompleted.map(renderCompleted)'))

    const vim = await sourceAudit('src/components/VimTextInput.tsx')
    assert.ok(vim.contents.includes('onLeftArrowOnEmptyMessage: props.onLeftArrowOnEmptyMessage'))
    assert.ok(vim.contents.includes('mask: props.mask'))

    const onboarding = await sourceAudit(
      'src/components/ClaudeInChromeOnboarding.tsx',
    )
    assert.ok(onboarding.contents.includes('import { c as _c } from "react/compiler-runtime"'))
    assert.ok(onboarding.contents.includes('const $ = _c(21)'))
    assert.ok(onboarding.contents.includes('<><Newline /><Newline />'))

    const taskWatcher = await sourceAudit('src/hooks/useTaskListWatcher.ts')
    assert.ok(taskWatcher.imports.has('watch'))
    assert.ok(taskWatcher.contents.includes('useEffect(() => {'))
    assert.equal(
      (taskWatcher.contents.match(/useEffect\(\(\) => \{/g) ?? []).length,
      2,
      'u19714 module source has both watcher effects',
    )
  },
)

test(
  'authenticated bundles pin every strict-tail residue and compiler oracle',
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
    const targetUnits = new Map()

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
      targetUnits.set(row.targetIndex, targetUnit)
      assert.equal(sha256(targetUnit), sourceHash, `${row.targetIndex}: target bytes`)
      const unitSyntax = collectOccurrences(targetUnit)
      assert.equal(unitSyntax.ast.body.length, 1, `${row.targetIndex}: one unit`)
      assert.equal(unitSyntax.ast.body[0].type, nodeType)

      for (const residue of row.residues) {
        const [kind, value, start, end, baselineCount, targetOrdinal, proof] = residue
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
          `${row.targetIndex}: ${residueIdentity}: exact range`,
        )

        if (proof === 'build-macro') {
          assert.ok(BUILD_VALUES.has(residueIdentity))
          assertBuildMacroOccurrence(occurrence, `${row.targetIndex}: ${residueIdentity}`)
        } else if (proof === 'platform-fold') {
          assert.equal(residueIdentity, 'string:"x64"')
          const call = occurrence.ancestors.find(
            ancestor => ancestor.type === 'CallExpression',
          )
          assert.ok(call, `${row.targetIndex}: platform literal is rendered`)
        } else if (proof === 'react-memo-cache') {
          const parent = occurrence.ancestors.at(-1)
          if (Number(value) === 40) {
            assert.equal(parent?.type, 'CallExpression')
            assert.equal(parent.arguments[0], occurrence.node)
          } else {
            assert.ok(
              targetUnit.includes(`$[${value}]`),
              `${row.targetIndex}: cache slot ${value} is addressed`,
            )
          }
        } else if (proof === 'compiler-runtime-import') {
          const member = occurrence.ancestors.at(-1)
          const call = occurrence.ancestors.at(-2)
          assert.equal(member?.type, 'MemberExpression')
          assert.equal(call?.type, 'CallExpression')
          assert.equal(call.callee, member)
          assert.equal(call.arguments[0]?.value, 21)
        } else if (proof === 'jsx-fragment') {
          const member = occurrence.ancestors.at(-1)
          assert.equal(member?.type, 'MemberExpression')
          assert.equal(member.property, occurrence.node)
        }
      }
    }

    assert.match(targetUnits.get(17211), /isSelected:[^,}]+&&!/)
    assert.match(targetUnits.get(17218), /\{task:[^,]+,isSelected:/)
    assert.match(targetUnits.get(17219), /\{task:[^,]+,isSelected:/)
    assert.match(targetUnits.get(19224), /\.c\(40\)/)
    assert.match(targetUnits.get(20130), /\.c\(21\)/)

    assert.equal(
      (target.match(/\bE74\b/g) ?? []).length,
      2,
      'u19714 fs binding occurs only in its declaration and initializer',
    )
    assert.equal(
      (target.match(/\bh74\b/g) ?? []).length,
      2,
      'u19714 task watcher hook has one declaration and one call',
    )
    assert.equal(
      (target.match(/\bS74\b/g) ?? []).length,
      2,
      'u19714 module initializer has one declaration and one bootstrap call',
    )
    assert.match(
      targetUnits.get(19714),
      /E74=require\("fs"\),[^;]+=[^;]+\(wH\(\),1\)/,
      'u19714 fs is an import binding in the task-watcher module initializer',
    )
  },
)

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.112-to-2.1.113'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const units = new Map([
  [2568, ['src/utils/settings/validation.ts', 'unresolved', 1081156, 1081804, 'FunctionDeclaration', '0061de322d56ec15681dcf4744f544acf3da9e0533cf0171d13ae686be9c7e8e', [['string', '\" was skipped: ', 1081623, 1081638, 0, 1, 'template-assembly']]]],
  [8142, ['src/services/api/errors.ts', 'unresolved', 3876316, 3877130, 'FunctionDeclaration', 'ad112744b01dfb8125d2f7338ce8e9e32e6fb5fd1eace363cac0c114db6cdd3a', [['regexp', { flags: '', pattern: '[.!?\\u2026]$' }, 3876555, 3876569, 0, 1, 'unicode-regexp']]]],
  [15101, ['src/commands/copy/copy.tsx', 'unresolved', 9403725, 9403869, 'ExpressionStatement', '75e746a3ff63a26c121adc42baa2b3e583833b34d5218c74d350a03eadd8c43a', [['property', 'tableTokenToMarkdown', 9403733, 9403753, 0, 1, 'declaration'], ['property', 'normalizeTablesInMarkdown', 9403762, 9403787, 0, 1, 'declaration']]]],
  [16461, ['src/commands/resume/resume.tsx', 'unresolved', 10407717, 10409194, 'FunctionDeclaration', '63999620e0fdd23eab0fd718c58e295c150d841ace1473456be0580f9255fe33', [['property', 'rows', 10407867, 10407871, 55, 63, 'destructure']]]],
  [16584, ['src/components/skills/SkillsMenu.tsx', 'unresolved', 10454571, 10457501, 'FunctionDeclaration', '5245e3c457920bbede71f7b2face76be131b7d2c4d23fd433492315f513aa981', [['property', 'rows', 10455462, 10455466, 55, 64, 'destructure']]]],
  [16686, ['src/components/ResumeTask.tsx', 'unresolved', 10519663, 10523226, 'FunctionDeclaration', '319bdea95645dbfa64b3fdd87929f0b990fc8b62de3b1b64a3d27c0f90a07bcc', [['property', 'rows', 10519721, 10519725, 55, 65, 'destructure']]]],
  [18691, ['src/components/mcp/ElicitationDialog.tsx', 'unresolved', 11555848, 11565784, 'FunctionDeclaration', '7a7e4547c79d8804b49ff5412819ce69eafd250a1829128cbaefcaea7d408dba', [['property', 'rows', 11557348, 11557352, 55, 69, 'destructure']]]],
  [18993, ['src/components/tasks/BackgroundTaskStatus.tsx', 'unresolved', 11685303, 11687879, 'FunctionDeclaration', 'bf37ce5b92302e1decda6b65673ef5f294b70de2f5b203aaf102459436461295', [['property', 'c', 11685329, 11685330, 164, 691, 'react-compiler'], ['property', 'startIndex', 11686289, 11686299, 105, 108, 'destructure']]]],
  [19085, ['src/components/PromptInput/PromptInput.tsx', 'unresolved', 11713890, 11740231, 'FunctionDeclaration', '8b305358bc5df748fd18605f072ac1ca674f0d25f5f9cda9659098d653a2367d', [['property', 'rows', 11734343, 11734347, 55, 71, 'destructure']]]],
  [19121, ['src/hooks/useSSHSession.ts', 'unresolved', 11763280, 11766187, 'FunctionDeclaration', '53851956a7bf2c48e9bfcd67e5d95658e8b0cabaedd28d9f72f7c4feccf99096', [['property', 'randomUUID', 11765252, 11765262, 20, 115, 'import']]]],
  [19189, ['src/hooks/useCancelRequest.ts', 'unresolved', 11782275, 11784343, 'FunctionDeclaration', '35a833ab8bf5e68cf501c8172f68dba8e2430cba38a82b7408de22027bd68c5c', [['property', 'screen', 11782375, 11782381, 85, 86, 'destructure'], ['property', 'isInputEmpty', 11782475, 11782487, 2, 5, 'destructure'], ['property', 'cancelAllPendingLoopSessionCrons', 11782759, 11782791, 0, 3, 'import']]]],
  [19920, ['src/screens/ResumeConversation.tsx', 'unresolved', 12139508, 12144244, 'FunctionDeclaration', 'b06c8971febe0feaaf5c98b0d0b69a1471477bde59f28ee01e4cbd579e36dd95', [['property', 'rows', 12139824, 12139828, 55, 78, 'destructure'], ['property', 'dirname', 12142161, 12142168, 74, 192, 'import']]]],
  [20356, ['src/commands/install.tsx', 'unresolved', 12876823, 12877319, 'FunctionDeclaration', '15f5e26e17dad8d07900c5861a42822ec5e3ab8527be35a820fbad4383af5f8e', [['property', 'c', 12876849, 12876850, 164, 765, 'react-compiler'], ['property', 'default', 12877209, 12877216, 5335, 5336, 'default-import']]]],
  [20357, ['src/commands/install.tsx', 'unresolved', 12877319, 12877447, 'FunctionDeclaration', '2c80ef77bfc545c4988d14d6d4d1d089313fbd7a5d5bed65aa92ed0989239424', [['property', 'default', 12877347, 12877354, 5335, 5337, 'default-import'], ['property', 'default', 12877395, 12877402, 5335, 5338, 'default-import']]]],
  [20428, ['src/main.tsx', 'unresolved', 12919913, 12920369, 'FunctionDeclaration', 'd3895be4533db661e7aab40cc2bf84b4686170f0114f3b2f0f390e2f46a16849', [['property', 'resolvedPath', 12920132, 12920144, 75, 80, 'destructure'], ['property', 'readFileSync', 12920167, 12920179, 43, 72, 'import']]]],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function identity(kind, value) {
  if (kind === 'regexp') {
    return `regexp:${JSON.stringify(value.pattern)}/${[...value.flags].sort().join('')}`
  }
  return `${kind}:${kind === 'string' || kind === 'property' ? JSON.stringify(value) : String(value)}`
}

function walk(node, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node.type === 'string') visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, visit)
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
  walk(ast, node => {
    if (node.type === 'Literal') {
      let literalIdentity
      if (node.regex) literalIdentity = identity('regexp', node.regex)
      else if (typeof node.value === 'string') literalIdentity = identity('string', node.value)
      else if (typeof node.value === 'number') literalIdentity = identity('number', node.value)
      else if (node.bigint !== undefined) literalIdentity = identity('bigint', node.bigint)
      if (literalIdentity) occurrences.push({ end: node.end, identity: literalIdentity, start: node.start })
    } else if (node.type === 'TemplateElement') {
      const value = node.value?.cooked ?? node.value?.raw
      if (typeof value === 'string') occurrences.push({ end: node.end, identity: identity('string', value), start: node.start })
    }
    const isProperty =
      (['Property', 'MethodDefinition', 'PropertyDefinition'].includes(node.type) && node.computed === false && node.key?.type === 'Identifier') ||
      (node.type === 'MemberExpression' && node.computed === false && node.property?.type === 'Identifier')
    if (isProperty) {
      const property = node.key ?? node.property
      occurrences.push({ end: property.end, identity: identity('property', property.name), start: property.start })
    }
  })
  occurrences.sort((left, right) => left.start - right.start)
  const grouped = new Map()
  for (const occurrence of occurrences) {
    const values = grouped.get(occurrence.identity) ?? []
    values.push(occurrence)
    grouped.set(occurrence.identity, values)
  }
  return { ast, grouped }
}

function authenticatedTargetInner(filename) {
  const bytes = fs.readFileSync(filename)
  const digest = sha256(bytes)
  if (digest === '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba') {
    return bytes.toString('utf8')
  }
  assert.equal(digest, 'dda4d89e787fa455706e4f41beffc8e58d42b9094c4d155fcbf62e3f19036681')
  const inner = bytes.subarray(87, bytes.length - 3)
  assert.equal(sha256(inner), '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba')
  return inner.toString('utf8')
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/typescript/lib/typescript.js'),
    path.join(repositoryRoot, '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js'),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

function sourceFilename(owner) {
  const relative = owner.replace(/^src\//, '')
  const direct = path.join(sourceRoot, relative)
  const nested = path.join(sourceRoot, owner)
  const filename = fs.existsSync(direct) ? direct : nested
  assert.ok(fs.existsSync(filename), `${owner}: source owner exists`)
  return filename
}

async function sourceRoles(owner) {
  const ts = await loadTypeScript()
  const filename = sourceFilename(owner)
  const source = fs.readFileSync(filename, 'utf8')
  const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${owner}: parses`)
  const roles = new Map()
  const add = (name, role) => {
    const values = roles.get(name) ?? new Set()
    values.add(role)
    roles.set(name, values)
  }
  function visit(node) {
    if (ts.isImportClause(node) && !node.isTypeOnly && node.name) add('default', 'default-import')
    if (ts.isImportSpecifier(node) && !node.isTypeOnly) add(node.propertyName?.text ?? node.name.text, 'import')
    if (ts.isBindingElement(node) && node.name && ts.isIdentifier(node.name)) add(node.propertyName?.text ?? node.name.text, 'destructure')
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name && ts.isIdentifier(node.name)) add(node.name.text, 'declaration')
    if (ts.isRegularExpressionLiteral(node)) {
      const match = /^\/(.*)\/([a-z]*)$/s.exec(node.text)
      if (match) {
        let pattern = match[1]
        try {
          pattern = new RegExp(pattern, match[2]).source
        } catch {}
        if (pattern === '[.!?…]$') add('[.!?\\u2026]$', 'unicode-regexp')
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  if (
    source.includes('`Invalid permission rule "${rule}" was skipped`') &&
    source.includes('message += `: ${result.error}`')
  ) {
    add('\" was skipped: ', 'template-assembly')
  }
  if (source.includes('react/compiler-runtime')) add('c', 'react-compiler')
  return roles
}

test(
  'the target113 direct owners provide every exact authored representation role',
  { skip: !selected ? `not applicable to ${semanticCase}` : false },
  async () => {
    assert.equal(units.size, 15)
    for (const [index, [owner, , , , , , residues]] of units) {
      const roles = await sourceRoles(owner)
      for (const [kind, value, , , , , proof] of residues) {
        const roleName = kind === 'regexp' ? value.pattern : value
        assert.ok(roles.get(roleName)?.has(proof), `${index}: ${owner} ${roleName} ${proof}`)
      }
    }
  },
)

test(
  'authenticated bundles pin every direct-owner representation residue',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.112 and 2.1.113 bundles are required'
        : false,
    timeout: 90_000,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    assert.equal(sha256(baselineBytes), 'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f')
    const baseline = collectOccurrences(baselineBytes.toString('utf8'))
    const targetSource = authenticatedTargetInner(targetPath)
    const target = collectOccurrences(targetSource)
    for (const [index, [owner, classification, start, end, nodeType, sourceHash, residues]] of units) {
      const region = structural.regions[index]
      assert.deepEqual(
        [region?.classification, region?.target?.start, region?.target?.end, region?.target?.nodeType, region?.target?.sourceHash],
        [classification, start, end, nodeType, sourceHash],
        `${index}: structural identity`,
      )
      assert.equal(sha256(targetSource.slice(start, end)), sourceHash, `${index}: target bytes`)
      assert.ok(fs.existsSync(sourceFilename(owner)), `${index}: owner exists`)
      for (const [kind, value, residueStart, residueEnd, baselineCount, targetOrdinal] of residues) {
        const residueIdentity = identity(kind, value)
        assert.equal((baseline.grouped.get(residueIdentity) ?? []).length, baselineCount, `${index}: ${residueIdentity} baseline count`)
        const occurrence = (target.grouped.get(residueIdentity) ?? [])[targetOrdinal - 1]
        assert.ok(occurrence, `${index}: ${residueIdentity} ordinal`)
        assert.deepEqual([occurrence.start, occurrence.end], [residueStart, residueEnd], `${index}: ${residueIdentity} exact range`)
        assert.ok(residueStart >= start && residueEnd <= end, `${index}: ${residueIdentity} belongs to exact unit`)
      }
    }
  },
)

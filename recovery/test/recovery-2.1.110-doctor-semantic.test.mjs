import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const selected = !semanticCase || semanticCase === caseName
const baselinePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
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
  [14463, [10514181, 10514230, 'dcff2fbbc28afcbd46a496419f55413c1f8c85470f96d4de705b1ac8dc12d5cd']],
  [14465, [10514241, 10514313, '0bef0b43f4d5120f3fc5c32da2d7405b3ade0ac152860574413a550e30f1924c']],
  [14467, [10514343, 10515059, '71ece43512f84a5e29a23ee7a075802170c074a61724735741041f1bbd67e541']],
  [14468, [10515059, 10524375, '63910fe3f96c6508bbbce6149170230cd815b609eb6d8f7977f678068e7d318a']],
  [14469, [10524375, 10524456, '9960c9f765236b1845082bcbae1b4b7c160a827970f4fecc6183a1ccd5ef6e11']],
  [14470, [10524456, 10524609, 'e0b9f802c601a2b102b933e18bc9dbc76e539fd8f771f99026576e9dbc2cf0fd']],
  [14471, [10524609, 10524708, '3d7fa67b76e64fdcb970eacebeb7de45d1b8db49688cbd7550b223ff85e70926']],
  [14472, [10524708, 10524957, '2215bf050c2c46a66b9e157be4c59e6d323a042253e836e61d13a58eb95c4c14']],
  [14473, [10524957, 10525156, '403aefd4f718846a79525f7ef57ed3625399e036e95b3e7d543d155adb8d3bda']],
  [14474, [10525156, 10525450, 'd67cdc5dab48a4294233b2135d665f58bcb5faf36c52ea0e47b808a26799ca92']],
  [14475, [10525450, 10525538, '07505c4cb2872bba83329834ba3a5233f090bafc516beb20b9fac54f86420e12']],
  [14485, [10526090, 10527532, 'f6d1e0060d8a9fc62ed04a5b56365ae3e07e7745695fde23c8b400f768d44be5']],
  [14486, [10527532, 10527834, '5563717929606ae50a936c2c86e78ee7d195a5f79c139cf9d1ca12d5550414c6']],
  [14487, [10527834, 10528044, 'f1691a995d6833285322f08c854828a1d5a79eeea5b3e98f37c30f1831ffd737']],
  [14489, [10528051, 10528246, 'e26a7bd3e6d8b419c7b517e3aa7e7afbe352ff906aacd8c3db5adb25b5caa86f']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

test(
  'target110 authenticates every Doctor runtime and helper row',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.109 and 2.1.110 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7',
    )
    assert.equal(
      sha256(targetBytes),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    const target = targetBytes.toString('utf8')
    for (const [index, [start, end, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }
    const doctor = target.slice(10515059, 10524375)
    for (const fragment of [
      'Currently running:',
      'Multiple installations found',
      'Auto-update channel:',
      'Unreachable permission rules',
      'Context usage warnings',
      'doctor:fix',
    ]) {
      assert.ok(doctor.includes(fragment), fragment)
    }
  },
)

test(
  'source owns the complete Doctor tree, fix prompt, and target evolution',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const doctor = source('screens/Doctor.tsx')
    for (const fragment of [
      "import { Connector, Tree } from '../components/design-system/Tree.js'",
      'Version check skipped (essential-traffic-only mode)',
      "<Connector connectors={['space', 'last']}>",
      "<Connector key={index} connectors={['space', 'space']}>",
      "'doctor:fix': () =>",
      "onDone(doctorFixPrompt, { display: 'user', shouldQuery: true })",
      'Help me fix the issues reported by /doctor below.',
      "[error.file, error.path].filter(Boolean).join(' › ')",
      ".join(' @ ')",
      'SandboxManager.checkDependencies().errors',
      'Context usage warnings',
      'Unreachable permission rules',
    ]) {
      assert.ok(doctor.includes(fragment), fragment)
    }

    if (semanticCase === caseName) {
      assert.equal(doctor.includes('isPlatformInEnabledList()'), false)
      assert.equal(doctor.includes('useModalScrollRef'), false)
      assert.equal(doctor.includes('Still having issues?'), false)
      assert.equal(doctor.includes('MACRO.GIT_SHA'), false)
      assert.ok(doctor.includes('<Suspense fallback={null}>'))
      assert.ok(doctor.includes('<Tree>'))
    } else {
      for (const fragment of [
        'SandboxManager.isPlatformInEnabledList()',
        'useModalScrollRef()',
        'maxHeight={Math.max(3, rows - 4)}',
        'Still having issues? Run /feedback to report details.',
        'MACRO.GIT_SHA.slice(0, 12)',
        'Platform: {process.platform}-{process.arch}',
        'Checking for updates…',
        '<Tree variant="tree">',
      ]) {
        assert.ok(doctor.includes(fragment), fragment)
      }
    }
  },
)

test(
  'Doctor fix prompt keeps detailed settings, plugin, and safety guidance',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const doctor = source('screens/Doctor.tsx')
    assert.match(
      doctor,
      /For each issue: briefly explain what the fix will do,[\s\S]*?Safe read-only checks are fine without asking\./,
    )
    assert.match(
      doctor,
      /Settings\$\{location \? ` \(\$\{location\}\)` : ''\}: \$\{error\.message\}/,
    )
    assert.match(
      doctor,
      /Plugin\$\{label \? ` \(\$\{label\}\)` : ''\}: \$\{getPluginErrorMessage\(error\)\}/,
    )
    assert.match(
      doctor,
      /Sandbox: \$\{error\}\\n  \(See \/sandbox for install instructions\)/,
    )
  },
)

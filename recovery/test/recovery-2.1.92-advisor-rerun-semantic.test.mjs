import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.91-to-2.1.92'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const targetSha256 =
  '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362'
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

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_92_BUNDLE is not set'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

const pinnedUnits = new Map([
  [12108, ['unresolved', 9373311, 9373362, '3364a3e1dc099b69aa65996467cb2922a8517f5103169262266d641533f18a47']],
  [12110, ['unresolved', 9373427, 9373678, '066fec249d4ae0dc7d112abe23e969461e83ab6e70dfea87232924d91048b6e4']],
  [12111, ['unresolved', 9373678, 9373716, '30f95a39699d16f260a314edebc95dbaa3759cd4a1a5d5f87be5c43aa37a6ea7']],
  [12119, ['unresolved', 9383393, 9387507, '293e75118919f9ef132855af0fcb7d16acba91b26bb9735e6b9163b756d33d09']],
  [12131, ['unresolved', 9391753, 9402294, '411f400e9b5daafc5350d14f03aee9b45af4cef210fdfbe453502a4fcbe71585']],
  [12228, ['unresolved', 9441403, 9455253, '1a594121c1b1b29b54e5e8c45ae3f5475d75b17ad5b01a9d3cc57aee0bb35b4c']],
  [12337, ['unresolved', 9529596, 9531328, '011f2d449e173d0ce03edf8828556fac40c6c8cb8013d89377a13ab683852dc3']],
  [18279, ['unresolved', 12969405, 12983924, 'b2b227467f760f38d8bc9d5b7bece0fd5f6c0722c2e4ea7070e5b3fd673a7384']],
  [15389, ['unresolved', 11260486, 11260509, '997a5b59a0435d6797e4e9c0f3f71ef58f94beac384e027669996e11cdd660d8']],
  [15390, ['unresolved', 11260509, 11261004, '77540e28ecec0693d5abf4fd4e5a7f23fb8844b51c96eb556f1541223915928c']],
  [15391, ['unresolved', 11261004, 11263110, '1da4f4620abdcecbf05dfd63848a2448e451e471ee593ba81047d90def810e5d']],
  [15392, ['unresolved', 11263110, 11263160, '0389d1b68cf983ca2d4554d01a79ebc2a54558506a92348af37dc2c7a2fe9b7e']],
  [15393, ['unresolved', 11263160, 11263204, 'a8284e664357e3c0851bda0682935514605911200a87ef63a1783a3316d2b476']],
  [15394, ['unresolved', 11263204, 11263242, '7a41368a27e9181e55f19b2bcc07f251328c64bce9fee2102381a7e5a65e9395']],
  [15395, ['unresolved', 11263242, 11263316, '8c33e2cb7441003fc5e22df2def3e6425cfe3f280650979c40b18489b19d30c4']],
  [15396, ['unresolved', 11263316, 11263600, 'ad04352131196c5e9c7d5e979a2f4d9564e0553a9f6152a0161a3a2478d2d322']],
  [15397, ['unresolved', 11263600, 11264017, '858a9c5e09209816fe2d9a9838b144556934b9b29f7c4310e50d608ec27a82f3']],
  [15398, ['unresolved', 11264017, 11264110, '3d311f091ffd0b6a5d64f40dc9d1df393867afa2baf9e62c3f7b892b432725d3']],
  [15400, ['unresolved', 11264118, 11264432, 'aca99c7dec6624909c7c0e98e0f4cd2ca6a5a18688593d41809c9cbeb6029aba']],
])

test('2.1.92 pins the complete Advisor and Bash-rerun structural clusters', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const bundle = bytes.toString('utf8')
  for (const [index, [classification, start, end, sourceHash]] of pinnedUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, classification, `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
  }
  for (const fragment of [
    'tengu_velvet_anchor',
    "Unknown rerun alias '",
    "'rerun' and 'command' are mutually exclusive",
    '[rerun: ',
    'Deferred tool resume: tool',
    'tool_deferred_unavailable',
    'deferred_tool_use:',
    'tengu_advisor_dialog_shown',
    'When Claude needs stronger judgment',
    'Configure the Advisor Tool',
  ]) {
    assert.ok(bundle.includes(fragment), fragment)
  }
})

test('materialized target92 source owns every Advisor and Bash-rerun branch', sourceOptions, () => {
  const read = filename =>
    fs.readFileSync(path.join(sourceRoot, filename), 'utf8')
  const rerun = read('tools/BashTool/rerunAliases.ts')
  for (const fragment of [
    "'tengu_velvet_anchor'",
    'nextId: 1',
    'const alias = `b${aliases.nextId++}`',
    "Unknown rerun alias '${alias}'",
    'return `[rerun: ${alias}]`',
  ]) {
    assert.ok(rerun.includes(fragment), fragment)
  }
  const execution = read('services/tools/toolExecution.ts')
  for (const fragment of [
    "'rerun' and 'command' are mutually exclusive",
    'resolveBashRerunAlias',
    'assignBashRerunAlias',
    'formatBashRerunFooter',
  ]) {
    assert.ok(execution.includes(fragment), fragment)
  }
  assert.ok(read('tools/BashTool/prompt.ts').includes('To rerun a prior command exactly'))
  assert.ok(read('tools/BashTool/BashTool.tsx').includes('rerun:'))
  assert.ok(read('Tool.ts').includes('bashRerunAliases'))
  const queryEngine = read('QueryEngine.ts')
  for (const fragment of [
    'private bashRerunAliases: BashRerunAliases',
    'this.bashRerunAliases = createBashRerunAliases()',
    'bashRerunAliases: this.bashRerunAliases',
  ]) {
    assert.ok(queryEngine.includes(fragment), `QueryEngine.ts: ${fragment}`)
  }
  assert.equal(
    queryEngine.match(/bashRerunAliases: this\.bashRerunAliases/g)?.length,
    2,
    'both SDK processUserInput contexts share one conversation-scoped alias map',
  )
  assert.ok(
    queryEngine.indexOf('this.bashRerunAliases = createBashRerunAliases()') <
      queryEngine.indexOf('bashRerunAliases: this.bashRerunAliases'),
    'the alias map is initialized before either tool-use context can consume it',
  )
  if (semanticCase === caseName) {
    const introductionPatch = fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases/2.1.88-to-2.1.89/semantic-supplement.patch',
      ),
      'utf8',
    )
    for (const fragment of [
      'hasHandledDeferredToolResume',
      "stop_reason: 'tool_deferred_unavailable'",
      'redeferredToolUse',
    ]) {
      assert.ok(
        introductionPatch.includes(fragment),
        `target89 carried deferred-tool owner: ${fragment}`,
      )
    }
  } else {
    for (const fragment of [
      'hasHandledDeferredToolResume',
      "stop_reason: 'tool_deferred_unavailable'",
      'redeferredToolUse',
    ]) {
      assert.ok(queryEngine.includes(fragment), `QueryEngine.ts: ${fragment}`)
    }
  }

  const advisor = read('commands/advisor.tsx')
  for (const fragment of [
    "logEvent('tengu_advisor_dialog_shown'",
    'When Claude needs stronger judgment',
    'pairing Sonnet as the main model with Opus as',
    'the advisor gives you near-Opus performance',
    "{ label: 'No advisor', value: 'off' }",
    "choice === 'off' || choice === 'unset'",
    'Invalid advisor model:',
    'Configure the Advisor Tool',
    "return !canUserConfigureAdvisor()",
  ]) {
    assert.ok(advisor.includes(fragment), fragment)
  }
})

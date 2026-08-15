import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(root, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(root, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'),
    ),
  ),
)

const units = new Map([
  [12925, [9604669, 9604991, 'FunctionDeclaration', '586abdd84ec132d2c50a422bcd7539dc0ba26c9ca37fd8745c6e851b254f9013', 'unresolved']],
  [13893, [10061282, 10064069, 'FunctionDeclaration', '9b2cc18d5ed26ce73cefec59ee7f8ef3b7ff4c9aca819d905e64ef330a2aae7c', 'unresolved']],
  [14093, [10137637, 10137968, 'FunctionDeclaration', 'd0ba705e6bdbf5fe2cb70952ef1be420235c4c5c2a493cd0369491d3db7beff5', 'unresolved']],
  [16904, [11788910, 11794803, 'FunctionDeclaration', '58ba4038eede350079c3b3e84d8fcde4b6c2a7d03a44db0d241b5320c33a1b65', 'unresolved']],
  [18652, [12634766, 12634923, 'FunctionDeclaration', '309007d9a8b70f1f7a0b965aa83322120e60da725068b9f51abc915cdd554a0b', 'unresolved']],
])

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')

test(
  'target110 pins the observable compact, btw, settings, prompt, and modal-pager residues',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated target109 and target110 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(sha256(baselineBytes), '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7')
    assert.equal(sha256(targetBytes), 'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861')
    const target = targetBytes.toString('utf8')
    for (const [index, [start, end, nodeType, hash, classification]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.nodeType, region.target.sourceHash],
        [start, end, nodeType, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: target bytes`)
    }

    assert.match(target.slice(9604669, 9604991), /Compaction blocked by PreCompact hook:/)
    assert.match(target.slice(10061282, 10064069), /action:"clear history"/)
    assert.match(target.slice(10137637, 10137968), /key:`gap-\$\{K\}`/)
    assert.match(
      target.slice(11788910, 11794803),
      /tengu_verified_vs_assumed.*When reporting results, be accurate about what you verified vs\. what you assumed/s,
    )
    assert.match(target.slice(12634766, 12634923), /"udbfnp"\.includes\(q\)/)
    assert.match(target.slice(12634766, 12634923), /"jkgGb "\.includes\(q\)/)
  },
)

test(
  'authored owners preserve the exact observable behavior and compositional layout',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const compact = fs.readFileSync(path.join(sourceRoot, 'services/compact/compact.ts'), 'utf8')
    assert.match(compact, /ERROR_MESSAGE_COMPACTION_BLOCKED\s*=\s*['"]Compaction blocked by PreCompact hook['"]/)
    assert.match(compact, /`\$\{ERROR_MESSAGE_COMPACTION_BLOCKED\}: \$\{hookResult\.blockedBy\}`/)
    assert.match(compact, /text:\s*['"]compaction blocked by PreCompact hook['"]/)

    const btw = fs.readFileSync(path.join(sourceRoot, 'commands/btw/btw.tsx'), 'utf8')
    assert.match(btw, /chord=['"]x['"] action=['"]clear history['"]/)
    assert.match(btw, /historyRef\.current\.length > 0/)

    const status = fs.readFileSync(path.join(sourceRoot, 'components/Settings/Status.tsx'), 'utf8')
    assert.match(status, /const sections = t3/)
    assert.match(status, /<Box flexDirection="column" gap=\{1\} flexGrow=\{grow\}>\{t4\}\{t5\}<\/Box>/)
    assert.match(status, /sections\.map\(_temp4\)/)

    const prompts = fs.readFileSync(path.join(sourceRoot, 'constants/prompts.ts'), 'utf8')
    assert.match(prompts, /getFeatureValue_CACHED_MAY_BE_STALE\(\s*['"]tengu_verified_vs_assumed['"],\s*false/s)
    assert.match(prompts, /When reporting results, be accurate about what you verified vs\. what you assumed\./)
    assert.match(prompts, /Distinguish between what you confirmed \(ran a command, read a file\) and what you believe but did not check\./)

    const scroll = fs.readFileSync(path.join(sourceRoot, 'components/ScrollKeybindingHandler.tsx'), 'utf8')
    assert.match(scroll, /export function isModalPagerInput/)
    assert.match(scroll, /key\.upArrow \|\| key\.downArrow \|\| key\.home \|\| key\.end/)
    assert.match(scroll, /if \(key\.ctrl\) return ['"]udbfnp['"]\.includes\(input\)/)
    assert.match(scroll, /return ['"]jkgGb ['"]\.includes\(input\)/)
    assert.match(scroll, /if \(isModal && isModalPagerInput\(input_0, key_0\)\) return/)
  },
)

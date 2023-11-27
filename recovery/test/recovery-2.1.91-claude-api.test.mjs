import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
const contentRoot = path.join(
  repositoryRoot,
  'src/skills/bundled/claude-api',
)
const contentModulePath = path.join(
  repositoryRoot,
  'src/skills/bundled/claudeApiContent.ts',
)
const targetBundlePath = process.env.CLAUDE_CODE_2_1_91_BUNDLE

const TARGET_BUNDLE_SHA256 =
  'b4bf141f30cf8b40196295816c7a6b9d01a36e906908d73a9f9a865ce4cdf816'

const expectedContent = [
  ['SKILL.md', 'i45', 20647, 'ff5c1e3a23b70a61632d54d2652ace6f5d35f389b8e8f4348b64f68d9000bfbe'],
  ['csharp/claude-api.md', 'T45', 14390, 'c17ddeb20330f54d8fbf9af3e1225ab0370396b86d211cf71b1f8a5008c39e5f'],
  ['curl/examples.md', 'V45', 6390, 'de7db56ef83ec865b14851c891470b850257728265bffd1c5721613447666c59'],
  ['go/claude-api.md', 'y45', 13873, '79730feb26fde385d351e269ff5dec022e9d2f88f1b94230c48b18db1b3e1a9b'],
  ['java/claude-api.md', 'L45', 15087, '4cde0009a39bd45efb897da2377c7318cb4e86123aeb1d66904cf4e368083156'],
  ['php/claude-api.md', 'R45', 11121, '2084c1414304336b30d5dbd6bf68445662584f034d4bd7a5796ef5d57de5e9d9'],
  ['python/agent-sdk/README.md', 'x45', 12672, 'f06fc8a83a16e28183f66733e08eb7e2633f6e31348fcfe384ae2389c185bab6'],
  ['python/agent-sdk/patterns.md', 'C45', 9197, '1a42261beea4f9dce4884931b311a88123b4b0981c7a303b10513c8796218303'],
  ['python/claude-api/README.md', 'g45', 12045, '3ed9c86237b6d320fd852a307986aad4151a53a6990f1b28fe473ae3397ce780'],
  ['python/claude-api/batches.md', 'u45', 5079, 'd831541750a3e0d4e2a88ba55528d96fc641c522410fdd396d6fa5c2f2697ab3'],
  ['python/claude-api/files-api.md', 'p45', 3982, 'c68c21fb62d40faf2d0678d0c249e0c54882865da38eb72bfd8145789172d3a9'],
  ['python/claude-api/streaming.md', 'U45', 5198, '216e6845432aad98d72d282523b1131c1c25553472d7575c7197702fb7817189'],
  ['python/claude-api/tool-use.md', 'd45', 16857, '9a74ef61c91d11c7ac24e42aa5dba4d928aa71c47f079db0a3f13bb300c46106'],
  ['ruby/claude-api.md', 'l45', 2919, '67a3b3341a2cbbb6c2b66f5b41f774fcf797ad70a0c8d0f1bb1226eafe0b3d14'],
  ['shared/agent-design.md', 'o45', 8335, '4801b81580e1251c0df809da9647b05b6e30513014f439f814caccfb7750e8a4'],
  ['shared/error-codes.md', 's45', 7090, '11cc407ed391415b4e26cb0d65a80638cc3d7f4eabc149513bb44234adab0fcc'],
  ['shared/live-sources.md', 'e45', 12116, '5a49e19c38418a37ce9953058f64de851b9353b31557fee40d65f39d92399de5'],
  ['shared/models.md', 'KK5', 7115, '2a18cf78b18d7e62e6e64810f4d3f28225e024fd1cfa4928dcb5d23dcc50d4d9'],
  ['shared/prompt-caching.md', 'zK5', 9773, 'e71e24994f603385f307e10f7dd6e83897419f00b25b7cfb3dc94ec764c7ca67'],
  ['shared/tool-use-concepts.md', '$K5', 16722, '81790a54f7175a4c6f38a186871004f252c3826bfc2f244798589f9fc215824f'],
  ['typescript/agent-sdk/README.md', 'jK5', 10834, '8b887efb720def6c51303d169e79ae94b6d78f8bbf81c66791543c77329f39c2'],
  ['typescript/agent-sdk/patterns.md', 'AK5', 4711, '8a47275106399f7274ff5db2978a8ea7addb1ac5d81086abebd42a5a620c7619'],
  ['typescript/claude-api/README.md', 'WK5', 9814, 'e0a2772459520f4ede3f16c6feb228bb1302632fdeadde7cf13c058f3135d90c'],
  ['typescript/claude-api/batches.md', 'JK5', 2588, '615f2b58513fcd089ba8e1e779b325ecb37b470c9ee3ddd4b601fed194129b56'],
  ['typescript/claude-api/files-api.md', 'XK5', 2257, 'a3cc51b06251e62fa954a04e59dfd62ce538caac18876a73c7232a95d922099f'],
  ['typescript/claude-api/streaming.md', 'fK5', 5569, 'd806e5bb7e3e204fba3e9e3910e9b6298adc1f661015e68eb0c4fee366d68e25'],
  ['typescript/claude-api/tool-use.md', 'GK5', 15298, 'b3ec1caa26cd80c4846a194f66676df4c1eb1f3e84a3604c0c5a251f0934972f'],
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function listFiles(directory, prefix = '') {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      files.push(...listFiles(path.join(directory, entry.name), relativePath))
    } else {
      files.push(relativePath)
    }
  }
  return files.sort()
}

function decodeStringAssignment(bundle, binding) {
  const anchor = `var ${binding}=`
  const start = bundle.indexOf(anchor)
  assert.notEqual(start, -1, `target binding ${binding} is missing`)
  assert.equal(
    bundle.indexOf(anchor, start + anchor.length),
    -1,
    `target binding ${binding} is not unique`,
  )

  let cursor = start + anchor.length
  const quote = bundle[cursor++]
  assert.ok(
    quote === '`' || quote === '"' || quote === "'",
    `target binding ${binding} is not a string literal`,
  )

  let value = ''
  while (cursor < bundle.length) {
    const character = bundle[cursor++]
    if (character === quote) return value
    if (character !== '\\') {
      value += character
      continue
    }

    const escape = bundle[cursor++]
    if (escape === '\n') continue
    if (escape === '\r') {
      if (bundle[cursor] === '\n') cursor++
      continue
    }

    const simpleEscapes = {
      b: '\b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
      v: '\v',
      0: '\0',
    }
    if (Object.hasOwn(simpleEscapes, escape)) {
      assert.ok(
        escape !== '0' || !/\d/.test(bundle[cursor] ?? ''),
        `target binding ${binding} uses an unsupported legacy octal escape`,
      )
      value += simpleEscapes[escape]
      continue
    }
    if (escape === 'x') {
      value += String.fromCharCode(
        Number.parseInt(bundle.slice(cursor, cursor + 2), 16),
      )
      cursor += 2
      continue
    }
    if (escape === 'u') {
      if (bundle[cursor] === '{') {
        const end = bundle.indexOf('}', cursor + 1)
        assert.notEqual(end, -1)
        value += String.fromCodePoint(
          Number.parseInt(bundle.slice(cursor + 1, end), 16),
        )
        cursor = end + 1
      } else {
        value += String.fromCharCode(
          Number.parseInt(bundle.slice(cursor, cursor + 4), 16),
        )
        cursor += 4
      }
      continue
    }

    value += escape
  }

  assert.fail(`target binding ${binding} has no closing quote`)
}

test('recovers every 2.1.91 claude-api document byte-for-byte', () => {
  assert.ok(
    targetBundlePath,
    'CLAUDE_CODE_2_1_91_BUNDLE environment variable must be set',
  )
  const targetBundleBytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(targetBundleBytes), TARGET_BUNDLE_SHA256)
  const targetBundle = targetBundleBytes.toString('utf8')

  const expectedPaths = expectedContent.map(([relativePath]) => relativePath)
  assert.deepEqual(listFiles(contentRoot), [...expectedPaths].sort())

  let totalBytes = 0
  for (const [relativePath, binding, bytes, expectedSha256] of expectedContent) {
    const source = fs.readFileSync(path.join(contentRoot, relativePath))
    totalBytes += source.length
    assert.equal(source.length, bytes, `${relativePath} byte length`)
    assert.equal(sha256(source), expectedSha256, `${relativePath} SHA-256`)

    const targetLiteral = Buffer.from(
      decodeStringAssignment(targetBundle, binding),
      'utf8',
    )
    assert.deepEqual(
      source,
      targetLiteral,
      `${relativePath} differs from target binding ${binding}`,
    )
  }
  assert.equal(totalBytes, 261679)
})

test('wires all recovered target documents into the bundled skill', () => {
  const contentModule = fs.readFileSync(contentModulePath, 'utf8')
  assert.match(
    contentModule,
    /import skillPrompt from '\.\/claude-api\/SKILL\.md'/,
  )
  assert.match(
    contentModule,
    /import sharedAgentDesign from '\.\/claude-api\/shared\/agent-design\.md'/,
  )
  assert.match(
    contentModule,
    /'shared\/agent-design\.md': sharedAgentDesign/,
  )

  for (const [relativePath] of expectedContent.slice(1)) {
    assert.equal(
      contentModule.includes(`'${relativePath}'`),
      true,
      `${relativePath} is not present in SKILL_FILES`,
    )
  }
})

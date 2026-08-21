import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.121',
    env: 'CLAUDE_CODE_2_1_121_BUNDLE',
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

function readBundle(release) {
  const filename = process.env[release.env]
  assert.ok(filename, `${release.env} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

test('authenticated adjacent bundles retain stateful unique virtual keys', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const helper = bundle.match(
      /function ([\w$]+)\(H,\$,q\)\{let K=0;if\(q\.itemKey===\$&&H\.length>=q\.keys\.length\)\{let [\w$]+=q\.keys\.length;while\(K<[\w$]+&&H\[K\]\.uuid===q\.uuids\[K\]\)K\+\+\}if\(K<q\.keys\.length\)q\.keys=\[\],q\.uuids=\[\],q\.seen=new Map,K=0;q\.itemKey=\$;let [\w$]+=null;for\(;K<H\.length;K\+\+\)/,
    )
    assert.ok(helper, `${release.version}: append-aware key helper`)
    assert.match(
      bundle,
      /q\.keys\.push\(`\$\{[\w$]+\}#\$\{[\w$]+\}`\),\([\w$]+\?\?=new Set\)\.add\([\w$]+\);q\.uuids\.push\([\w$]+\.uuid\)/,
      `${release.version}: duplicate suffix and uuid cache`,
    )
    assert.match(
      bundle,
      /\.slice\(0,3\)\.map\(\([\w$]+\)=>`\$\{[\w$]+\} \\xD7\$\{q\.seen\.get\([\w$]+\)\}`\);[\w$]+\(Error\(`VirtualMessageList: duplicate sibling keys \(leaks DOM nodes via mapRemainingChildren overwrite\):/,
      `${release.version}: bounded duplicate diagnostic`,
    )
    assert.match(
      bundle,
      new RegExp(
        `useRef\\(\\{keys:\\[\\],uuids:\\[\\],seen:new Map,itemKey:[\\w$]+\\}\\),[\\w$]+=[\\w$]+\\.useMemo\\(\\(\\)=>${helper[1]}\\(`,
      ),
      `${release.version}: component owns persistent key state`,
    )
  }
})

test('source reconstructs append-aware key stability and duplicate handling', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/components/VirtualMessageList.tsx'),
    'utf8',
  )
  for (const fragment of [
    "import { logError } from '../utils/log.js'",
    'messages.length >= state.keys.length',
    'messages[index]!.uuid === state.uuids[index]',
    'state.keys = []',
    'state.uuids = []',
    'state.seen = new Map()',
    'state.keys.push(`${key}#${seenCount}`)',
    '(duplicateKeys ??= new Set()).add(key)',
    'state.uuids.push(message.uuid)',
    '.slice(0, 3)',
    'VirtualMessageList: duplicate sibling keys (leaks DOM nodes via mapRemainingChildren overwrite):',
    'buildUniqueKeys(messages, itemKey, keyState.current)',
  ]) {
    assert.ok(source.includes(fragment), fragment)
  }
  assert.doesNotMatch(source, /messages\.map\(itemKey\)/)
})

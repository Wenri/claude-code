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
    count: 0,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    count: 1,
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

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

test('authenticates target-only Docker connection flag validation', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const flag of ['--tlscacert', '--tlscert', '--tlskey']) {
      assert.equal(
        occurrences(bundle, flag),
        release.count,
        `${release.version}: ${flag}`,
      )
    }
  }
})

test('source rejects Docker host, context, config, and TLS overrides', () => {
  const source = compact(
    fs.readFileSync(
      path.join(repo, 'src/utils/shell/readOnlyCommandValidation.ts'),
      'utf8',
    ),
  )
  for (const fragment of [
    "const DOCKER_CONNECTION_FLAGS = [ '-H', '-c', '--host', '--context', '--config', '--tlscacert', '--tlscert', '--tlskey', ]",
    'arg === flag || arg.startsWith(`${flag}=`) || (flag.length === 2 && arg.length > 2 && arg.startsWith(flag))',
    'const shortFlagBundle = arg.match(/^-([A-Za-z]+)/)?.[1]',
    'DOCKER_SHORT_CONNECTION_FLAGS.has(flag)',
  ]) {
    assert.ok(source.includes(compact(fragment)), fragment)
  }
  assert.equal(
    occurrences(source, 'dockerArgsAreDangerous(args)'),
    2,
    'docker logs and docker inspect both use the guard',
  )
})

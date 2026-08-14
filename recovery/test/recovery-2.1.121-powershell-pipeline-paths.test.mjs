import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const specs = [
  ['CLAUDE_CODE_2_1_120_BUNDLE', 13_784_743, 'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f'],
  ['CLAUDE_CODE_2_1_121_BUNDLE', 13_908_188, '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a'],
]

function bundle([env, bytes, sha]) {
  const filename = process.env[env]
  assert.ok(filename, `${env} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, bytes)
  assert.equal(crypto.createHash('sha256').update(value).digest('hex'), sha)
  return value.toString('utf8')
}

test('2.1.121 hardens PowerShell pipeline path handling', () => {
  const [baseline, target] = specs.map(bundle)
  const warning = 'may receive a path from an upstream pipeline command'
  assert.equal(baseline.includes(warning), false)
  assert.equal(target.split(warning).length - 1, 1)
  assert.equal(baseline.split('get-module').length - 1, 1)
  assert.equal(target.split('get-module').length - 1, 2)
  assert.equal(baseline.split('get-netipconfiguration').length - 1, 1)
  assert.equal(target.includes('get-netipconfiguration'), false)
  assert.equal(baseline.split('get-cimclass').length - 1, 1)
  assert.equal(target.includes('get-cimclass'), false)
})

test('source asks for unvalidated pipeline paths and narrows read-only commands', () => {
  const pathValidation = fs.readFileSync(
    path.join(repo, 'src/tools/PowerShellTool/pathValidation.ts'),
    'utf8',
  )
  const readOnly = fs.readFileSync(
    path.join(repo, 'src/tools/PowerShellTool/readOnlyValidation.ts'),
    'utf8',
  )

  assert.match(pathValidation, /'get-module': \{[\s\S]*?operationType: 'read'/)
  for (const value of [
    '-name',
    '-fullyqualifiedname',
    '-listavailable',
    '-skipeditioncheck',
    '-pssession',
    '-cimsession',
  ]) {
    assert.match(pathValidation, new RegExp(`'${value}'`))
  }
  assert.match(pathValidation, /let hasPotentialPathOutput = false/)
  assert.match(pathValidation, /const upstreamMayProducePath = hasPotentialPathOutput/)
  assert.match(pathValidation, /upstreamMayProducePath && acceptsPaths/)
  assert.match(
    pathValidation,
    /may receive a path from an upstream pipeline command whose output cannot be statically validated and requires manual approval/,
  )
  for (const command of [
    'get-childitem',
    'get-item',
    'get-itemproperty',
    'resolve-path',
    'convert-path',
    'get-filehash',
    'get-acl',
    'test-path',
  ]) {
    assert.match(pathValidation, new RegExp(`'${command}'`))
  }

  for (const removed of ['get-service', 'get-netipconfiguration', 'get-cimclass']) {
    assert.equal(readOnly.includes(`'${removed}':`), false, removed)
  }
})

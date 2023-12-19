import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.110-to-2.1.111'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(root, 'src'),
)
const targetPath = process.env.CLAUDE_CODE_2_1_111_BUNDLE
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(root, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'),
    ),
  ),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test(
  'target111 pins live SSH permission-mode synchronization',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetPath
        ? 'authenticated target111 bundle is required'
        : false,
  },
  () => {
    const bytes = fs.readFileSync(targetPath)
    assert.equal(sha256(bytes), '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0')
    const target = bytes.toString('utf8')
    const region = structural.regions[18180]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.nodeType, region.target.start, region.target.end, region.target.sourceHash],
      ['FunctionDeclaration', 12448271, 12451162, '3eace4d15e330aa82a429ec2ff8eec0d1ee905fb1f9f152e27466c897edbf19e'],
    )
    const unit = target.slice(region.target.start, region.target.end)
    assert.equal(sha256(unit), region.target.sourceHash)
    assert.match(
      unit,
      /useRef\([^)]*\).*useEffect\(\(\)=>\{if\([^=]+=[^,]+,[^)]*\.current\)[^?]+\?\.setPermissionMode\([^)]*\)\}.*onConnected:.*setPermissionMode/s,
    )
  },
)

test(
  'source updates a connected SSH manager and seeds mode on connect',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const hook = fs.readFileSync(path.join(sourceRoot, 'hooks/useSSHSession.ts'), 'utf8')
    const repl = fs.readFileSync(path.join(sourceRoot, 'screens/REPL.tsx'), 'utf8')
    const sharedPath = path.join(sourceRoot, 'hooks/useExternalSession.ts')
    if (fs.existsSync(sharedPath)) {
      const shared = fs.readFileSync(sharedPath, 'utf8')
      for (const fragment of [
        'permissionMode?: PermissionMode',
        'const permissionModeRef = useRef(permissionMode)',
        'permissionModeRef.current = permissionMode',
        'if (permissionMode !== undefined && isConnectedRef.current)',
        'managerRef.current?.setPermissionMode?.(permissionMode)',
        'manager.setPermissionMode?.(permissionModeRef.current)',
      ]) {
        assert.ok(shared.includes(fragment), fragment)
      }
      assert.ok(hook.includes('permissionMode: PermissionMode'))
      assert.ok(hook.includes('permissionMode,'))
      const sshCall = repl.slice(
        repl.indexOf('const sshRemote = useSSHSession({'),
        repl.indexOf('// Use whichever remote mode'),
      )
      assert.ok(sshCall.includes('permissionMode: toolPermissionContext.mode'))
      return
    }
    for (const fragment of [
      'permissionMode: PermissionMode',
      'const permissionModeRef = useRef(permissionMode)',
      'permissionModeRef.current = permissionMode',
      'if (isConnectedRef.current)',
      'managerRef.current?.setPermissionMode(permissionMode)',
      'manager.setPermissionMode(permissionModeRef.current)',
    ]) {
      assert.ok(hook.includes(fragment), fragment)
    }
    assert.ok(repl.includes('permissionMode: toolPermissionContext.mode'))

    const calls = []
    let connected = false
    let current = 'default'
    const setMode = mode => {
      current = mode
      if (connected) calls.push(mode)
    }
    setMode('plan')
    assert.deepEqual(calls, [])
    connected = true
    calls.push(current)
    setMode('acceptEdits')
    assert.deepEqual(calls, ['plan', 'acceptEdits'])
  },
)

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
    EDQUOT: 0,
    EFBIG: 0,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    EDQUOT: 1,
    EFBIG: 1,
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

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

test('authenticates target-only copy-failure destination cleanup taxonomy', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(occurrences(bundle, 'EDQUOT'), release.EDQUOT)
    assert.equal(occurrences(bundle, 'EFBIG'), release.EFBIG)
    assert.equal(occurrences(bundle, '.draft-'), 2)
  }

  const target = readBundle(releases[1])
  for (const fragment of [
    'new Set(["EXDEV","EPERM","EEXIST","EBUSY"])',
    'new Set(["ENOSPC","EIO","EDQUOT","EFBIG"])',
    'try{await ni.copyFile(K,H)}catch(z){if($KK.has(V8(z)??""))await ni.unlink(H).catch(()=>{});throw z}',
    'try{li.copyFileSync(K,H)}catch(z){if($KK.has(V8(z)??""))try{li.unlinkSync(H)}catch{}throw z}',
  ]) {
    assert.ok(target.includes(fragment), fragment)
  }
})

test('source central writer exactly cleans incomplete fallback destinations', () => {
  const writer = compact(source('src/utils/atomicWrite.ts'))
  for (const fragment of [
    "const RENAME_FALLBACK_CODES = new Set([ 'EXDEV', 'EPERM', 'EEXIST', 'EBUSY', ])",
    "const DESTINATION_CLEANUP_CODES = new Set([ 'ENOSPC', 'EIO', 'EDQUOT', 'EFBIG', ])",
    "const temporary = `${target}.tmp.${randomBytes(4).toString('hex')}`",
    "await writeFile(temporary, content, { encoding: 'utf8', mode })",
    'await copyFile(temporary, target)',
    "if (DESTINATION_CLEANUP_CODES.has(getErrnoCode(copyError) ?? '')) { await unlink(target).catch(() => {}) } throw copyError",
    "writeFileSync(temporary, content, { encoding: 'utf8', mode })",
    'copyFileSync(temporary, target)',
    "if (DESTINATION_CLEANUP_CODES.has(getErrnoCode(copyError) ?? '')) { try { unlinkSync(target) } catch {} } throw copyError",
  ]) {
    assert.ok(writer.includes(compact(fragment)), fragment)
  }
})

test('all authenticated shared-writer callsites use the central helper', () => {
  const expected = {
    'src/daemon/jobs.ts': [
      'atomicWriteFile( join(jobDir, STATE_FILE), JSON.stringify(persisted, null, 2), )',
      'atomicWriteFile(path, JSON.stringify([...pins], null, 2))',
    ],
    'src/memdir/memoryWriteSurvey.ts': [
      'atomicWriteFile(record.filePath, record.beforeContent)',
      "atomicWriteFile(entrypoint, filtered.join('\\n'))",
    ],
    'src/utils/prStatus.ts': ['atomicWriteFile(path, json)'],
    'src/daemon/supervisor.ts': [
      'atomicWriteFile( getRosterPath(), JSON.stringify(manifest, null, 2), 0o600, )',
    ],
    'src/daemon/main.ts': [
      'atomicWriteFile(path, JSON.stringify(status, null, 2))',
    ],
    'src/daemon/config.ts': ['atomicWriteFile(path, value)'],
    'src/daemon/workerRegistry.ts': [
      'atomicWriteFile(path, JSON.stringify(status))',
    ],
    'src/cli/bg.ts': [
      'atomicWriteFile(path, JSON.stringify(dispatch), 0o600)',
    ],
    'src/utils/secureStorage/plainTextStorage.ts': [
      'atomicWriteFileSync(storagePath, jsonStringify(data), 0o600)',
    ],
  }
  for (const [relativePath, fragments] of Object.entries(expected)) {
    const contents = compact(source(relativePath))
    for (const fragment of fragments) {
      assert.ok(contents.includes(compact(fragment)), `${relativePath}: ${fragment}`)
    }
  }
})

test('retained FleetView draft persistence uses async and shutdown-safe writes', () => {
  const drafts = compact(source('src/utils/fleetDraft.ts'))
  for (const fragment of [
    'const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1_000',
    "createHash('sha256').update(cwd).digest('hex').slice(0, 8)",
    "join(getJobsDir(), `.draft-${hash}`)",
    'await mkdir(getJobsDir(), { recursive: true })',
    'await atomicWriteFile(getDraftPath(cwd), serializeDraft(query))',
    'atomicWriteFileSync(getDraftPath(cwd), serializeDraft(query))',
    "entries .filter(entry => entry.startsWith('.draft-'))",
  ]) {
    assert.ok(drafts.includes(compact(fragment)), fragment)
  }

  const fleet = compact(source('src/components/FleetView.tsx'))
  for (const fragment of [
    'void canonicalizePath(rootCwd).then(canonical =>',
    'if (value) void saveFleetDraft(cwd, value) else void deleteFleetDraft(cwd)',
    '300, queryRef, draftCwd',
    'registerCleanup(() => { const value = queryRef.current if (value) saveFleetDraftSync(draftCwd, value) })',
    'void deleteFleetDraft(draftCwd)',
    'let initialQuery = await loadFleetDraft(await canonicalizePath(getCwd()))',
    'void cleanupFleetDrafts()',
  ]) {
    assert.ok(fleet.includes(compact(fragment)), fragment)
  }

  assert.ok(
    compact(source('src/utils/cleanup.ts')).includes(
      'await cleanupFleetDrafts()',
    ),
  )
})

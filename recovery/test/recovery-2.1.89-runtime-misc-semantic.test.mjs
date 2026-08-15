import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : fileURLToPath(new URL('../../src/', import.meta.url))
const caseRoot = fileURLToPath(
  new URL('../cases/2.1.88-to-2.1.89/', import.meta.url),
)
const structuralPath = `${caseRoot}structural/generated-delta.json.gz`
const patchPath = `${caseRoot}semantic/runtime-misc.patch`
const ledgerFragmentPath = `${caseRoot}semantic/runtime-misc-ledger-fragment.json`
const targetBundlePath = process.env.CLAUDE_CODE_2_1_89_BUNDLE
const TARGET_SHA256 =
  'a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01'
const PATCH_SHA256 =
  'df0c805b29bb4532562e9a18a4ceef823da67b5262712a049f927e533fa74ff8'

function requiredTargetBundle() {
  assert.ok(
    targetBundlePath,
    'CLAUDE_CODE_2_1_89_BUNDLE environment variable must be set',
  )
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    TARGET_SHA256,
  )
  return bytes.toString('utf8')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test('runtime-misc evidence pins every owning 2.1.89 structural unit', () => {
  const target = requiredTargetBundle()
  const structural = JSON.parse(
    zlib.gunzipSync(fs.readFileSync(structuralPath)).toString('utf8'),
  )
  const pinned = new Map([
    [9404, [7845995, 7848517, 'e3d19fbc5dee5bee057de6eb9783790fa8961f06a72553b1589bcb19c58cc2e7']],
    [12135, [9468931, 9469029, '944d21ea0c9f09f1a98752a6500a808b6e62578a149de76211f5024477d8ba7a']],
    [12140, [9469814, 9473732, 'd0f285903e2cb8b52c76c69c1c868b72e5cbb3653275abbedd7b17bf122be7c3']],
    [12144, [9477798, 9480972, 'b2fa0834df805d32c0d87f4e23313600f2b842bbb06e50a839764aee7ccf0159']],
    [12187, [9496061, 9496104, '0f5fae2f44bd2defe5059d0adf3d361aca8d42d0755786a827623c2e4fd27b71']],
    [12192, [9497105, 9498451, '64cb5f6fce3fc10d142ae8aca490bcc11b4742ea2477fad2cc5d91619edceba4']],
    [12193, [9498451, 9498554, '37a7c713827ff37f9e826f6f35f5e9dc35388607fc66c49a16ddbb68ffc2fd9f']],
    [15821, [11472391, 11472761, '61e3b722e275d51811941320d0d77b925357adb939a096b4ab733323f0c1286b']],
    [16745, [11989478, 11990476, 'b56a9d316418be9f31079de9e1709c2b7f1b7a5b26d83ca9e4aad13a67cd70a1']],
  ])

  for (const [index, [start, end, sourceHash]] of pinned) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.equal(region.target.index, index)
    assert.equal(region.target.start, start)
    assert.equal(region.target.end, end)
    assert.equal(region.target.sourceHash, sourceHash)
    assert.equal(
      sha256(target.slice(start, end)),
      sourceHash,
      `target structural unit ${index} coordinate/hash drift`,
    )
  }
})

test('target owns install-permission, background-worktree, and MCP ranking behavior', () => {
  const target = requiredTargetBundle()
  const structural = JSON.parse(
    zlib.gunzipSync(fs.readFileSync(structuralPath)).toString('utf8'),
  )
  const unit = index => {
    const { start, end } = structural.regions[index].target
    return target.slice(start, end)
  }

  const updaterTarget = unit(9404)
  assert.ok(
    updaterTarget.includes(
      '/\\b(EACCES|EPERM|permission denied)\\b/i.test(Y)',
    ),
  )
  assert.equal(updaterTarget.match(/"no_permissions"/g)?.length, 1)
  assert.ok(
    updaterTarget.indexOf('["install","-g",K]') <
      updaterTarget.indexOf('permission denied'),
  )
  assert.ok(
    unit(15821).includes(
      '/^bg-[a-zA-Z0-9._-]{1,55}-[0-9a-f]{8}$/'
    ),
  )
  assert.ok(
    unit(16745).includes('M.item.type==="mcp_resource"?0.15:0'),
  )
})

test('target owns the complete gated cold-compaction control flow', () => {
  const target = requiredTargetBundle()
  const structural = JSON.parse(
    zlib.gunzipSync(fs.readFileSync(structuralPath)).toString('utf8'),
  )
  const unit = index => {
    const { start, end } = structural.regions[index].target
    return target.slice(start, end)
  }

  assert.ok(
    unit(12135).includes(
      'q.type!=="attachment"||q.attachment.type==="queued_command"',
    ) ||
      unit(12135).includes(
        'K.type!=="attachment"||K.attachment.type==="queued_command"',
      ),
  )
  assert.ok(unit(12140).includes('stripNonEssential:A'))
  assert.ok(unit(12144).includes('let A=!O&&u8("tengu_compact_cache_prefix",!0)'))
  assert.ok(unit(12144).includes('O?O_Y(D):D'))
  assert.ok(unit(12192).includes('let X=L_Y()&&u8("tengu_cold_compact",!1)'))
  assert.ok(unit(12192).includes('BE6(q,K,_,!0,void 0,!0,J,X)'))
  assert.ok(unit(12193).includes('E_Y=5400000'))
  assert.equal(unit(12187), 'function L_Y(){return Date.now()-JR()>=E_Y}')
})

test('current src has equivalent first-party runtime owners', () => {
  const updater = source('utils/autoUpdater.ts')
  const worktree = source('utils/worktree.ts')
  const suggestions = source('hooks/unifiedSuggestions.ts')
  const autoCompact = source('services/compact/autoCompact.ts')
  const compact = source('services/compact/compact.ts')

  const installStart = updater.indexOf(
    'export async function installGlobalPackage',
  )
  const installEnd = updater.indexOf('\nexport ', installStart + 1)
  const installGlobalPackage = updater.slice(
    installStart,
    installEnd === -1 ? undefined : installEnd,
  )
  assert.ok(installStart >= 0)
  assert.equal(installGlobalPackage.includes('checkGlobalInstallPermissions()'), false)

  assert.match(
    installGlobalPackage,
    /const combinedOutput = `\$\{installResult\.stdout\} \$\{installResult\.stderr\}`[\s\S]*?\/\\b\(EACCES\|EPERM\|permission denied\)\\b\/i\.test\(combinedOutput\)[\s\S]*?return 'no_permissions'/,
  )
  assert.match(worktree, /\/\^bg-\[a-zA-Z0-9\._-\]\{1,55\}-\[0-9a-f\]\{8\}\$\//)
  assert.match(
    suggestions,
    /result\.item\.type === 'mcp_resource' \? 0\.15 : 0/,
  )

  assert.match(autoCompact, /COLD_COMPACT_MIN_SESSION_MS = 90 \* 60 \* 1000/)
  assert.match(
    autoCompact,
    /getTotalDuration\(\) >= COLD_COMPACT_MIN_SESSION_MS[\s\S]*?getFeatureValue_CACHED_MAY_BE_STALE\('tengu_cold_compact', false\)/,
  )
  assert.match(
    autoCompact,
    /const stripNonEssential = shouldUseColdCompaction\(\)[\s\S]*?compactConversation\([\s\S]*?recompactionInfo,[\s\S]*?stripNonEssential,/,
  )

  assert.match(
    compact,
    /stripNonEssentialCompactAttachments[\s\S]*?message\.type !== 'attachment' \|\|[\s\S]*?message\.attachment\.type === 'queued_command'/,
  )
  assert.match(
    compact,
    /compactConversation\([\s\S]*?stripNonEssential: boolean = false/,
  )
  assert.match(
    compact,
    /logEvent\('tengu_compact',[\s\S]*?preCompactTokenCount,[\s\S]*?stripNonEssential,/,
  )
  assert.match(
    compact,
    /const promptCacheSharingEnabled =\s*!stripNonEssential &&[\s\S]*?'tengu_compact_cache_prefix'/,
  )
  assert.match(
    compact,
    /const messagesForSummary = stripNonEssential[\s\S]*?stripNonEssentialCompactAttachments\(compactMessages\)[\s\S]*?: compactMessages/,
  )
})

test('standalone historical supplement is pinned and contains every owner', () => {
  const patch = fs.readFileSync(patchPath)
  assert.equal(sha256(patch), PATCH_SHA256)
  const text = patch.toString('utf8')
  for (const path of [
    'src/hooks/unifiedSuggestions.ts',
    'src/services/compact/autoCompact.ts',
    'src/services/compact/compact.ts',
    'src/utils/autoUpdater.ts',
    'src/utils/worktree.ts',
  ]) {
    assert.ok(text.includes(`diff --git a/${path} b/${path}`), path)
  }
})

test('canonical-ledger fragment closes exactly the nine runtime-misc units', () => {
  const structural = JSON.parse(
    zlib.gunzipSync(fs.readFileSync(structuralPath)).toString('utf8'),
  )
  const fragment = JSON.parse(fs.readFileSync(ledgerFragmentPath, 'utf8'))
  assert.equal(fragment.criterion, 'compiled-ast-function-semantics-v1')
  assert.equal(fragment.rows.length, 9)
  assert.equal(
    fragment.rows.some(row => row.disposition === 'source-runtime-gap'),
    false,
  )

  const owners = new Map(fragment.owners.map(owner => [owner.id, owner]))
  const evidence = new Map(fragment.evidence.map(item => [item.id, item]))
  for (const row of fragment.rows) {
    const target = structural.regions[row.targetIndex].target
    for (const field of ['start', 'end', 'nodeType', 'sourceHash']) {
      assert.equal(row[field], target[field], `${row.targetIndex} ${field}`)
    }
    assert.equal(row.structuralClass, 'unresolved')
    assert.equal(row.disposition, 'source-runtime-covered')
    assert.ok(row.behavior.length > 0)
    for (const ownerId of row.ownerIds) {
      const owner = owners.get(ownerId)
      assert.ok(owner, ownerId)
      assert.ok(source(owner.path.slice(4)).includes(owner.anchor), ownerId)
    }
    assert.ok(
      row.evidenceIds.some(id => evidence.get(id)?.kind === 'target-fragment'),
    )
    assert.ok(
      row.evidenceIds.some(id => evidence.get(id)?.kind === 'semantic-test'),
    )
  }
})

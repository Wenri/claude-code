import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.112-to-2.1.113'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const baselinePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.113-audio-capture-vendor-runtime-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const caseRoot = path.join(
  repositoryRoot,
  'recovery/cases/2.1.112-to-2.1.113',
)
const structuralBytes = fs.readFileSync(
  path.join(caseRoot, 'structural/generated-delta.json.gz'),
)
const partitionsBytes = fs.readFileSync(
  path.join(caseRoot, 'attribution/target-partitions.jsonl.gz'),
)
const sourcesBytes = fs.readFileSync(
  path.join(caseRoot, 'attribution/sources.jsonl.gz'),
)
const structural = JSON.parse(gunzipSync(structuralBytes))
const partitions = gunzipSync(partitionsBytes)
  .toString('utf8')
  .trimEnd()
  .split('\n')
  .map(line => JSON.parse(line))
const sources = gunzipSync(sourcesBytes)
  .toString('utf8')
  .trimEnd()
  .split('\n')
  .map(line => JSON.parse(line))

const FIXTURE_SHA256 =
  'a0e4756e3f3a8583a8418180e5a88684118206a763f3ed6b90743f59116877f0'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function targetIdentity(region) {
  return {
    classification: region.classification,
    index: region.target.index,
    start: region.target.start,
    end: region.target.end,
    nodeType: region.target.nodeType,
    tokenCount: region.target.tokenCount,
    sourceHash: region.target.sourceHash,
    coarseHash: region.target.coarseHash,
  }
}

function baselineIdentity(unit) {
  return {
    index: unit.index,
    start: unit.start,
    end: unit.end,
    nodeType: unit.nodeType,
    tokenCount: unit.tokenCount,
    sourceHash: unit.sourceHash,
    coarseHash: unit.coarseHash,
  }
}

function authenticatedTargetInner(filename) {
  const bytes = fs.readFileSync(filename)
  const digest = sha256(bytes)
  if (digest === fixture.artifact.targetInnerSha256) {
    return bytes.toString('utf8')
  }
  assert.equal(
    digest,
    fixture.artifact.targetWrapperSha256,
    'authenticated target wrapper',
  )
  const inner = bytes.subarray(
    fixture.artifact.targetWrapperPrefixLength,
    bytes.length - fixture.artifact.targetWrapperSuffixLength,
  )
  assert.equal(
    sha256(inner),
    fixture.artifact.targetInnerSha256,
    'authenticated target inner',
  )
  return inner.toString('utf8')
}

function templateChunks(source, offset = 0) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const chunks = []
  function walk(node) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) walk(child)
      return
    }
    if (node.type === 'TemplateElement') {
      chunks.push({
        end: offset + node.end,
        start: offset + node.start,
        value: node.value?.cooked ?? node.value?.raw,
      })
    }
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
        walk(child)
      }
    }
  }
  walk(ast)
  return { ast, chunks }
}

function sourceFilename(owner) {
  const relative = owner.replace(/^src\//, '')
  const candidates = [
    path.join(sourceRoot, relative),
    path.join(sourceRoot, owner),
  ]
  const filename = candidates.find(fs.existsSync)
  assert.ok(filename, `${owner}: source consumer exists`)
  return filename
}

test('u13269 is exactly the unpinned vendored audio-capture loader', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, caseName)
  assert.deepEqual(fixture.summary, { units: 1, residues: 1 })
  assert.equal(sha256(structuralBytes), fixture.artifact.structuralGzipSha256)
  assert.equal(sha256(partitionsBytes), fixture.artifact.partitionsGzipSha256)
  assert.equal(sha256(sourcesBytes), fixture.artifact.sourcesGzipSha256)

  const row = fixture.row
  assert.equal(row.targetIndex, 13269)
  assert.equal(row.disposition, 'dependency-runtime')
  assert.equal(row.category, 'first-party-vendored-build-input-unpinned')
  assert.equal(row.classification, 'material-or-unresolved-delta-unpinned')
  assert.equal(row.package, 'audio-capture-napi')
  assert.equal(row.sourceBuildInputPinned, false)
  assert.deepEqual(row.coverageOwners, [])

  const targetRegion = structural.regions[row.targetIndex]
  assert.deepEqual(targetIdentity(targetRegion), row.target)
  const baselineUnit = structural.unmatchedBaseline.find(
    unit => unit.index === row.baseline.index,
  )
  assert.deepEqual(baselineIdentity(baselineUnit), row.baseline)

  for (const reachability of row.targetReachability) {
    const region = structural.regions[reachability.targetIndex]
    assert.equal(region?.target?.index, reachability.targetIndex)
    assert.deepEqual(
      {
        end: region.target.end,
        nodeType: region.target.nodeType,
        sourceHash: region.target.sourceHash,
        start: region.target.start,
      },
      {
        end: reachability.end,
        nodeType: reachability.nodeType,
        sourceHash: reachability.sourceHash,
        start: reachability.start,
      },
      `${reachability.role}: structural identity`,
    )
  }

  const vendorSource = sources.find(
    item => item.sourceIndex === row.sourceAttribution.sourceIndex,
  )
  assert.ok(vendorSource)
  assert.equal(vendorSource.source, row.sourceAttribution.source)
  assert.equal(
    vendorSource.mappedSegmentCount,
    row.sourceAttribution.mappedSegmentCount,
  )
  assert.deepEqual(
    [vendorSource.envelopeStart, vendorSource.envelopeEnd],
    [row.sourceAttribution.envelopeStart, row.sourceAttribution.envelopeEnd],
  )
  const vendorCluster = vendorSource.targetAnchorClusters.find(
    cluster =>
      cluster.targetStart === row.sourceAttribution.targetAnchorStart &&
      cluster.targetEnd === row.sourceAttribution.targetAnchorEnd,
  )
  assert.ok(vendorCluster, 'vendor target anchor cluster')
  assert.equal(vendorCluster.anchorCount, row.sourceAttribution.targetAnchorCount)
  assert.equal(
    vendorCluster.sampleLiteralSha256,
    row.sourceAttribution.targetAnchorSampleSha256,
  )
  assert.ok(vendorCluster.targetStart >= row.target.start)
  assert.ok(vendorCluster.targetEnd <= row.target.end)

  const consumerSource = sources.find(
    item => item.sourceIndex === row.integrationConsumer.sourceIndex,
  )
  assert.equal(consumerSource?.source, row.integrationConsumer.source)
  const consumerCluster = consumerSource.targetAnchorClusters.find(
    cluster =>
      cluster.targetStart === row.integrationConsumer.targetAnchorStart &&
      cluster.targetEnd === row.integrationConsumer.targetAnchorEnd,
  )
  assert.ok(consumerCluster, 'voice-service target anchor cluster')
  assert.ok(
    consumerCluster.targetStart > row.target.end,
    'voice.ts attribution starts after the complete vendor-loader unit',
  )

  const residuePartition = partitions.find(
    item => item.id === 'partition-023325',
  )
  assert.ok(residuePartition)
  assert.ok(residuePartition.target.offsetStart <= row.residue.start)
  assert.ok(residuePartition.target.offsetEnd >= row.residue.end)
  assert.deepEqual(residuePartition.sourceCandidates, [3647, 3648])
  assert.equal(
    residuePartition.boundarySourceIndices.right,
    row.sourceAttribution.sourceIndex,
  )
  const vendorOnlyPartition = partitions.find(
    item => item.id === 'partition-023326',
  )
  assert.ok(vendorOnlyPartition)
  assert.equal(vendorOnlyPartition.classification, 'changed-same-source')
  assert.equal(vendorOnlyPartition.confidence, 'high')
  assert.equal(
    vendorOnlyPartition.attributedSourceIndex,
    row.sourceAttribution.sourceIndex,
  )
  assert.deepEqual(vendorOnlyPartition.sourceCandidates, [3648])
  assert.ok(vendorOnlyPartition.target.offsetStart >= row.target.start)
  assert.ok(vendorOnlyPartition.target.offsetEnd <= row.target.end)
})

test(
  'voice.ts consumes audio-capture-napi but does not author its native loader',
  { skip: !selected ? `not applicable to ${semanticCase}` : false },
  () => {
    const row = fixture.row
    const filename = sourceFilename(row.integrationConsumer.sourcePath)
    const source = fs.readFileSync(filename, 'utf8')
    assert.match(source, /typeof import\(['"]audio-capture-napi['"]\)/)
    assert.match(source, /await import\(['"]audio-capture-napi['"]\)/)
    assert.match(source, /mod\.isNativeAudioAvailable\(\)/)
    assert.doesNotMatch(source, /\.\/vendor\/audio-capture\/\$\{/)
    assert.doesNotMatch(source, /function loadModule\s*\(/)

    const treeRoot = path.resolve(path.dirname(filename), '../..')
    const vendorFilename = path.join(
      treeRoot,
      'vendor/audio-capture-src/index.ts',
    )
    assert.equal(
      fs.existsSync(vendorFilename),
      false,
      'the target-pinned vendor source/build input is absent from the reconstructed source tree',
    )
  },
)

test(
  'authenticated bundles prove x64- is a live Linux/x64 build fold of the vendor loader',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.112 and 2.1.113 bundles are required'
        : false,
  },
  () => {
    const row = fixture.row
    const baselineBytes = fs.readFileSync(baselinePath)
    assert.equal(sha256(baselineBytes), fixture.artifact.baselineSha256)
    const baseline = baselineBytes.toString('utf8')
    const target = authenticatedTargetInner(targetPath)
    const baselineFragment = baseline.slice(row.baseline.start, row.baseline.end)
    const targetFragment = target.slice(row.target.start, row.target.end)
    assert.equal(sha256(baselineFragment), row.baseline.sourceHash)
    assert.equal(sha256(targetFragment), row.target.sourceHash)

    const baselineSyntax = templateChunks(baselineFragment, row.baseline.start)
    const targetSyntax = templateChunks(targetFragment, row.target.start)
    assert.equal(baselineSyntax.ast.body.length, 1)
    assert.equal(baselineSyntax.ast.body[0].type, row.baseline.nodeType)
    assert.equal(targetSyntax.ast.body.length, 1)
    assert.equal(targetSyntax.ast.body[0].type, row.target.nodeType)

    assert.match(baselineFragment, /let [\w$]+=process\.platform/)
    assert.ok(baselineFragment.includes('`${process.arch}-${q}`'))
    assert.match(baselineFragment, /process\.env\.AUDIO_CAPTURE_NODE_PATH/)
    assert.ok(
      baselineFragment.includes(
        '`./vendor/audio-capture/${K}/audio-capture.node`',
      ),
    )
    assert.ok(
      baselineFragment.includes(
        '`../audio-capture/${K}/audio-capture.node`',
      ),
    )

    assert.match(targetFragment, /let [\w$]+="linux"/)
    assert.ok(targetFragment.includes('`x64-${H}`'))
    assert.ok(
      targetFragment.includes(
        '`./vendor/audio-capture/${$}/audio-capture.node`',
      ),
    )
    assert.ok(
      targetFragment.includes(
        '`../audio-capture/${$}/audio-capture.node`',
      ),
    )
    assert.match(targetFragment, /for\(let [\w$]+ of [\w$]+\)try/)

    const baselineGlobal = templateChunks(baseline).chunks.filter(
      occurrence => occurrence.value === row.residue.value,
    )
    const targetGlobal = templateChunks(target).chunks.filter(
      occurrence => occurrence.value === row.residue.value,
    )
    assert.equal(baselineGlobal.length, row.residue.baselineCount)
    assert.equal(targetGlobal.length, row.residue.targetOrdinal)
    assert.deepEqual(
      [
        targetGlobal[row.residue.targetOrdinal - 1].start,
        targetGlobal[row.residue.targetOrdinal - 1].end,
      ],
      [row.residue.start, row.residue.end],
    )
    assert.equal(
      target.slice(row.residue.start, row.residue.end),
      row.residue.value,
    )

    const reachability = Object.fromEntries(
      row.targetReachability.map(item => [
        item.role,
        target.slice(item.start, item.end),
      ]),
    )
    for (const item of row.targetReachability) {
      assert.equal(
        sha256(reachability[item.role]),
        item.sourceHash,
        `${item.role}: exact target bytes`,
      )
    }
    assert.match(
      reachability['vendor-export'],
      /isNativeAudioAvailable:\(\)=>_61/,
    )
    assert.equal(
      reachability['availability-adapter'],
      'function _61(){return ve()!==null}',
    )
    assert.match(
      reachability['voice-service-consumer'],
      /then\(\(\) => az7\)/,
    )
    assert.match(
      reachability['voice-service-consumer'],
      /\$\.isNativeAudioAvailable\(\)/,
    )
  },
)

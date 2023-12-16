#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  buildTarget119BootstrapCostsOutput,
  TARGET119_BOOTSTRAP_COSTS_BLOCK,
  TARGET119_BOOTSTRAP_COSTS_DONOR,
  TARGET119_BOOTSTRAP_COSTS_INPUT,
  TARGET119_BOOTSTRAP_COSTS_OUTPUT,
  TARGET119_BOOTSTRAP_COSTS_OWNER_OVERRIDES,
} from './replay-bootstrap-additional-model-costs-source-gap.mjs'

const root = fileURLToPath(new URL('../../../..', import.meta.url))
const targetIndex = 21176
const structuralPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/structural/generated-delta.json.gz',
)
const reportPath = path.join(
  root,
  '.recovery-tmp/residue-audits/2.1.118-to-2.1.119.typed-audit.json',
)
const targetBundlePath = path.join(
  root,
  '.recovery-tmp/authenticated-artifacts/2.1.119-linux-x64/cli.inner.js',
)
const sourceInputPath = path.join(
  root,
  '.recovery-tmp/semantic-trees/2.1.119',
  TARGET119_BOOTSTRAP_COSTS_INPUT.path,
)
const donorPath = path.join(
  root,
  '.recovery-tmp/semantic-trees/2.1.120',
  TARGET119_BOOTSTRAP_COSTS_DONOR.path,
)
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-bootstrap-additional-model-costs-source-gap.json',
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function canonicalResidue(row) {
  return [
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
  ]
}

const structuralBytes = fs.readFileSync(structuralPath)
const structural = JSON.parse(gunzipSync(structuralBytes))
const region = structural.regions.find(row => row.target.index === targetIndex)
if (!region || region.target.sourceHash !== '65e20f7453f2ee0bdf6f8c2d16d339aa614e1e13fba1c4f6448c3be70eb3b53f') {
  throw new Error('Target119 bootstrap structural unit differs')
}
const reportBytes = fs.readFileSync(reportPath)
const report = JSON.parse(reportBytes)
const residues = report.sourceRuntimeAddedOwnerResidueRows
  .filter(row => row.structural.index === targetIndex)
  .map(canonicalResidue)
if (
  residues.length !== 11 ||
  sha256(JSON.stringify(residues)) !==
    '914fb7208b2696b909997a025b74f0fe7049a3a522e778866ab90f7553070d33'
) {
  throw new Error('Target119 bootstrap owner-residue universe differs')
}

const inputBytes = fs.readFileSync(sourceInputPath)
if (
  inputBytes.length !== TARGET119_BOOTSTRAP_COSTS_INPUT.bytes ||
  sha256(inputBytes) !== TARGET119_BOOTSTRAP_COSTS_INPUT.sha256
) {
  throw new Error('Target119 bootstrap source preimage differs')
}
const outputBytes = Buffer.from(
  buildTarget119BootstrapCostsOutput(inputBytes.toString('utf8')),
)
if (
  outputBytes.length !== TARGET119_BOOTSTRAP_COSTS_OUTPUT.bytes ||
  sha256(outputBytes) !== TARGET119_BOOTSTRAP_COSTS_OUTPUT.sha256
) {
  throw new Error('Target119 bootstrap source postimage differs')
}
const donorBytes = fs.readFileSync(donorPath)
if (
  donorBytes.length !== TARGET119_BOOTSTRAP_COSTS_DONOR.bytes ||
  sha256(donorBytes) !== TARGET119_BOOTSTRAP_COSTS_DONOR.sha256
) {
  throw new Error('Target120 bootstrap donor source differs')
}
const donorText = donorBytes.toString('utf8')
if (donorText.split(TARGET119_BOOTSTRAP_COSTS_BLOCK).length !== 2) {
  throw new Error('Target120 bootstrap donor block is not unique')
}
if (
  Buffer.byteLength(TARGET119_BOOTSTRAP_COSTS_BLOCK) !==
    TARGET119_BOOTSTRAP_COSTS_DONOR.blockBytes ||
  sha256(TARGET119_BOOTSTRAP_COSTS_BLOCK) !==
    TARGET119_BOOTSTRAP_COSTS_DONOR.blockSha256
) {
  throw new Error('Target120 bootstrap donor block differs')
}

const targetBundle = fs.readFileSync(targetBundlePath)
const targetUnit = targetBundle.subarray(region.target.start, region.target.end)
if (sha256(targetUnit) !== region.target.sourceHash) {
  throw new Error('Target119 bootstrap target unit differs')
}
const override = TARGET119_BOOTSTRAP_COSTS_OWNER_OVERRIDES[0]
const fixture = {
  schemaVersion: 1,
  case: '2.1.118-to-2.1.119',
  status: 'authenticated-source-gap-replay',
  targetIndex,
  evidenceIds: override.evidenceIds,
  ownerOverride: override,
  inputs: {
    targetBundle: descriptor(targetBundle),
    structural: {
      path:
        'recovery/cases/2.1.118-to-2.1.119/structural/generated-delta.json.gz',
      ...descriptor(structuralBytes),
    },
    frozenScannerSnapshot: {
      path:
        '.recovery-tmp/residue-audits/2.1.118-to-2.1.119.typed-audit.json',
      ...descriptor(reportBytes),
    },
    sourcePreimage: TARGET119_BOOTSTRAP_COSTS_INPUT,
    sourcePostimage: TARGET119_BOOTSTRAP_COSTS_OUTPUT,
    authenticatedDonor: TARGET119_BOOTSTRAP_COSTS_DONOR,
  },
  target: {
    classification: region.classification,
    nodeType: region.target.nodeType,
    start: region.target.start,
    end: region.target.end,
    bytes: region.target.end - region.target.start,
    sourceHash: region.target.sourceHash,
    tokenCount: region.target.tokenCount,
  },
  summary: {
    units: 1,
    residues: residues.length,
    targetIndicesSha256: sha256(JSON.stringify([targetIndex])),
    residueIdentitiesSha256: sha256(
      JSON.stringify(residues.map(residue => [targetIndex, ...residue])),
    ),
    sourceBlockBytes: TARGET119_BOOTSTRAP_COSTS_DONOR.blockBytes,
    sourceBlockSha256: TARGET119_BOOTSTRAP_COSTS_DONOR.blockSha256,
  },
  residues,
  targetMarkers: [
    'additional_model_costs',
    'input_tokens',
    'output_tokens',
    'prompt_cache_write_tokens',
    'prompt_cache_read_tokens',
    'web_search_requests',
    'inputTokens',
    'outputTokens',
    'promptCacheWriteTokens',
    'promptCacheReadTokens',
    'webSearchRequests',
  ],
  sourceMarkers: [
    'additional_model_costs: z',
    'input_tokens: z.number()',
    'output_tokens: z.number()',
    'prompt_cache_write_tokens: z.number()',
    'prompt_cache_read_tokens: z.number()',
    'web_search_requests: z.number().nullish()',
    'inputTokens: costs.input_tokens',
    'outputTokens: costs.output_tokens',
    'promptCacheWriteTokens: costs.prompt_cache_write_tokens',
    'promptCacheReadTokens: costs.prompt_cache_read_tokens',
    'webSearchRequests: costs.web_search_requests ?? 0.01',
  ],
  artifactPhasePolicy: {
    pairing: 'exact-report-and-coverage-descriptor-pair',
    rejectHybridPairs: true,
    rejectUnknownPairs: true,
    acceptedPairs: [
      {
        phase: 'post-u21759',
        typedAudit: {
          path:
            '.recovery-tmp/residue-audits/2.1.118-to-2.1.119.typed-audit.json',
          bytes: 24991569,
          sha256:
            'c4ab243f3937141db7984b0d4d9cdde7900805369a74a8b9b7589b13fbd1e78d',
        },
        sourceCoverage: {
          path:
            'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
          bytes: 382108,
          sha256:
            '09d6075beeb3174217b97555ddbf67593b72fb5ba9c67e1e143154bd955af810',
        },
        sourceCoverageRaw: {
          bytes: 3290710,
          sha256:
            '858d4a5dcfb37ce36a43078351ed68dd76c1e565e883617ff451974c2fde1071',
        },
      },
      {
        phase: 'post-u21878',
        typedAudit: {
          path:
            '.recovery-tmp/residue-audits/2.1.118-to-2.1.119.typed-audit.json',
          bytes: 24991569,
          sha256:
            'c4ab243f3937141db7984b0d4d9cdde7900805369a74a8b9b7589b13fbd1e78d',
        },
        sourceCoverage: {
          path:
            'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
          bytes: 383456,
          sha256:
            '874421d61f40166898113e0967be904859cda7c00493ee57303b97164bbb0015',
        },
        sourceCoverageRaw: {
          bytes: 3297173,
          sha256:
            '0facb150b84243148609b0e5562484d5d9e5c29f895d03c3a3566484b347b08e',
        },
      },
    ],
  },
  latestArtifactProjection: {
    phases: ['post-u21759', 'post-u21878'],
    units: [
      {
        targetIndex: 21176,
        partitions: {
          sourceRuntimeOwnerResidueRows: {
            full: {
              rows: 22,
              jsonBytes: 9109,
              sha256:
                '2f48b0f08653da53a459c68dbed1ad362598f2a55c8233ec9990cc290ebb0d12',
            },
            identities: {
              rows: 22,
              jsonBytes: 1453,
              sha256:
                '5414ee3a4181bf09c4c72e019d8ccec15ea4655bcb68d0ab42682073aeb2ade8',
            },
          },
          sourceRuntimeAddedOwnerResidueRows: {
            full: {
              rows: 11,
              jsonBytes: 33180,
              sha256:
                '17584d94dc1ed7f763bd53e9e9cdd775881b1c9a4ac2802c83f111cd3dbdab12',
            },
            identities: {
              rows: 11,
              jsonBytes: 675,
              sha256:
                'eb3d55e5d55c37fd0aebd3b8762fa6f973494a0a736e96ac26b7f68f47eeeebd',
            },
          },
          rows: {
            full: {
              rows: 0,
              jsonBytes: 2,
              sha256:
                '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
            },
            identities: {
              rows: 0,
              jsonBytes: 2,
              sha256:
                '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
            },
          },
          unclassifiedAddedOccurrenceRows: {
            full: {
              rows: 0,
              jsonBytes: 2,
              sha256:
                '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
            },
            identities: {
              rows: 0,
              jsonBytes: 2,
              sha256:
                '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
            },
          },
        },
        coverageRows: {
          rows: 1,
          jsonBytes: 616,
          sha256:
            '692277891802a3f62ec42cd587b7f90f75559b597e6330a885f48346f12a42bb',
        },
        ownerCatalog: [
          {
            id: 'owner-src-services-api-bootstrap-ts',
            path: 'src/services/api/bootstrap.ts',
          },
        ],
      },
    ],
  },
}

const serialized = `${JSON.stringify(fixture, null, 2)}\n`
if (process.argv.includes('--write')) fs.writeFileSync(fixturePath, serialized)
else process.stdout.write(serialized)

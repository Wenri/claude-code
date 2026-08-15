import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.110-to-2.1.111'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_111_BUNDLE

const BASELINE_SHA256 =
  'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861'
const TARGET_SHA256 =
  '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0'
const suffixRegex = '/\\[1m\\]$/i'

const probeUnits = new Map([
  [
    10_476,
    {
      nodeType: 'FunctionDeclaration',
      start: 8_155_710,
      end: 8_156_178,
      sourceHash:
        'aee217e0c86cddce2b084350299b12924ea30916a19e04481cfcc5c3ee90702b',
      residueStart: 8_155_845,
      functionName: 'yC6',
      factoryName: 'S8Y',
    },
  ],
  [
    10_534,
    {
      nodeType: 'FunctionDeclaration',
      start: 8_185_665,
      end: 8_186_133,
      sourceHash:
        '04335602e6b29866429a7260f6e6d40f83aa6408d0764f05ca8cb6178b360eaa',
      residueStart: 8_185_800,
      functionName: 'RC6',
      factoryName: 'o8Y',
    },
  ],
])

const providerOwnerUnits = new Map([
  [
    10_381,
    {
      nodeType: 'FunctionDeclaration',
      start: 8_116_808,
      end: 8_119_190,
      sourceHash:
        '1fe04d5fcc200372f878be5664ab85747592c6deb9cf575e0fd794d1c2d68d1c',
      owner: 'components/BedrockSetupWizard.tsx',
      residues: [
        ['string:"~/.claude/settings.json"', 0, 1, 8_116_984, 8_117_009, '"~/.claude/settings.json"'],
        ['string:"Bedrock configuration saved to "', 0, 1, 8_117_576, 8_117_607, 'Bedrock configuration saved to '],
        ['string:"These will be written to "', 0, 1, 8_118_049, 8_118_076, '"These will be written to "'],
        ['string:" under env:"', 0, 1, 8_118_079, 8_118_092, '" under env:"'],
      ],
    },
  ],
  [
    10_483,
    {
      nodeType: 'FunctionDeclaration',
      start: 8_159_348,
      end: 8_159_402,
      sourceHash:
        '4d3586aa10a3b39b2f76464cfba6a7c6c0308ec4922dd52b7aba0f75504e1ad0',
      owner: 'components/BedrockSetupWizard.tsx',
      functionName: 'u8Y',
      residues: [
        ['regexp:"\\\\[1m\\\\]$"/i', 1, 3, 8_159_370, 8_159_380, '/\\[1m\\]$/i'],
      ],
    },
  ],
  [
    10_525,
    {
      nodeType: 'FunctionDeclaration',
      start: 8_181_301,
      end: 8_183_613,
      sourceHash:
        '36bb6b94292dca1c049ad985838c41e881f72bb177109f44a897d9b3264e2719',
      owner: 'components/VertexSetupWizard.tsx',
      residues: [
        ['string:"~/.claude/settings.json"', 0, 2, 8_181_477, 8_181_502, '"~/.claude/settings.json"'],
        ['string:"Vertex AI configuration saved to "', 0, 1, 8_182_046, 8_182_079, 'Vertex AI configuration saved to '],
        ['string:"These will be written to "', 0, 2, 8_182_472, 8_182_499, '"These will be written to "'],
        ['string:" under env:"', 0, 2, 8_182_502, 8_182_515, '" under env:"'],
      ],
    },
  ],
  [
    10_539,
    {
      nodeType: 'FunctionDeclaration',
      start: 8_187_892,
      end: 8_187_946,
      sourceHash:
        'c1e0441074c1de730fc0658ec321eab803e28964693c75ce0a408398875cbcd0',
      owner: 'components/VertexSetupWizard.tsx',
      functionName: 't8Y',
      residues: [
        ['regexp:"\\\\[1m\\\\]$"/i', 1, 5, 8_187_914, 8_187_924, '/\\[1m\\]$/i'],
      ],
    },
  ],
])

const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function walk(value, visit) {
  if (value === null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const child of value) walk(child, visit)
    return
  }
  if (typeof value.type === 'string') visit(value)
  for (const [key, child] of Object.entries(value)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, visit)
    }
  }
}

function literalPositions(source) {
  const positions = new Map()
  const add = (identity, start) => {
    const values = positions.get(identity) ?? []
    values.push(start)
    positions.set(identity, values)
  }
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  walk(ast, node => {
    if (node.type === 'Literal') {
      if (node.regex) {
        add(
          `regexp:${JSON.stringify(node.regex.pattern)}/${[...node.regex.flags].sort().join('')}`,
          node.start,
        )
      } else if (typeof node.value === 'string') {
        add(`string:${JSON.stringify(node.value)}`, node.start)
      }
    } else if (node.type === 'TemplateElement') {
      const value = node.value?.cooked ?? node.value?.raw
      if (typeof value === 'string') add(`string:${JSON.stringify(value)}`, node.start)
    }
  })
  return positions
}

function readAuthenticated(filename, expectedHash) {
  const bytes = fs.readFileSync(filename)
  assert.equal(sha256(bytes), expectedHash)
  return bytes.toString('utf8')
}

function compileTargetProbe(unit, source, createClient) {
  const body = source.slice(unit.start, unit.end)
  assert.equal(sha256(body), unit.sourceHash)
  return Function(
    unit.factoryName,
    `${body}; return ${unit.functionName}`,
  )(createClient)
}

function compileTargetHelper(unit, source) {
  const body = source.slice(unit.start, unit.end)
  assert.equal(sha256(body), unit.sourceHash)
  return Function(`${body}; return ${unit.functionName}`)()
}

test(
  'pins the exact authenticated provider owner units and every target-added residue occurrence',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.110 and 2.1.111 bundles are required'
        : false,
  },
  () => {
    const baseline = readAuthenticated(baselinePath, BASELINE_SHA256)
    const target = readAuthenticated(targetPath, TARGET_SHA256)
    const baselinePositions = literalPositions(baseline)
    const targetPositions = literalPositions(target)

    for (const [index, unit] of providerOwnerUnits) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: classification`)
      assert.deepEqual(
        [
          region.target.index,
          region.target.nodeType,
          region.target.start,
          region.target.end,
          region.target.sourceHash,
        ],
        [index, unit.nodeType, unit.start, unit.end, unit.sourceHash],
        `${index}: structural identity`,
      )
      assert.equal(sha256(target.slice(unit.start, unit.end)), unit.sourceHash)

      for (const [identity, baselineCount, targetOrdinal, start, end, raw] of unit.residues) {
        assert.equal((baselinePositions.get(identity) ?? []).length, baselineCount, `${index}: ${identity} baseline count`)
        assert.equal((targetPositions.get(identity) ?? [])[targetOrdinal - 1], start, `${index}: ${identity} target ordinal`)
        assert.ok(start >= unit.start && end <= unit.end, `${index}: ${identity} unit range`)
        assert.equal(target.slice(start, end), raw, `${index}: ${identity} raw target fragment`)
      }
    }
  },
)

test(
  'authenticated provider cache-suffix helpers preserve existing suffixes and append missing suffixes',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetPath
        ? 'authenticated 2.1.111 bundle is required'
        : false,
  },
  () => {
    const target = readAuthenticated(targetPath, TARGET_SHA256)
    for (const index of [10_483, 10_539]) {
      const helper = compileTargetHelper(providerOwnerUnits.get(index), target)
      assert.equal(helper('claude-opus-4-7[1m]'), 'claude-opus-4-7[1m]')
      assert.equal(helper('claude-opus-4-7[1M]'), 'claude-opus-4-7[1M]')
      assert.equal(helper('claude-opus-4-7'), 'claude-opus-4-7[1m]')
      assert.equal(helper('claude-opus-4-7[1m]-preview'), 'claude-opus-4-7[1m]-preview[1m]')
    }
  },
)

test(
  'target111 introduces trailing 1m normalization in both authenticated provider probe units',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.110 and 2.1.111 bundles are required'
        : false,
  },
  () => {
    const baseline = readAuthenticated(baselinePath, BASELINE_SHA256)
    const target = readAuthenticated(targetPath, TARGET_SHA256)

    assert.equal(occurrences(baseline, suffixRegex), 1)
    assert.equal(occurrences(target, suffixRegex), 5)
    for (const [index, unit] of probeUnits) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: classification`)
      assert.deepEqual(
        [
          region.target.index,
          region.target.nodeType,
          region.target.start,
          region.target.end,
          region.target.sourceHash,
        ],
        [index, unit.nodeType, unit.start, unit.end, unit.sourceHash],
        `${index}: structural identity`,
      )
      assert.equal(sha256(target.slice(unit.start, unit.end)), unit.sourceHash)
      assert.equal(
        target.slice(unit.residueStart, unit.residueStart + suffixRegex.length),
        suffixRegex,
        `${index}: authenticated target-added residue`,
      )
      assert.match(
        target.slice(unit.start, unit.end),
        /messages\.create\(\{model:\w+\.replace\(\/\\\[1m\\\]\$\/i,""\),max_tokens:1/,
      )
    }
  },
)

test(
  'both authenticated target probes strip only a trailing case-insensitive 1m suffix before dispatch',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetPath
        ? 'authenticated 2.1.111 bundle is required'
        : false,
  },
  async () => {
    const target = readAuthenticated(targetPath, TARGET_SHA256)

    for (const [index, unit] of probeUnits) {
      const requests = []
      const probe = compileTargetProbe(unit, target, async () => ({
        messages: {
          create: async request => {
            requests.push(request)
          },
        },
      }))
      assert.deepEqual(
        await probe({}, 'claude-opus-4-7[1M]'),
        { ok: true },
        `${index}: successful probe`,
      )
      assert.deepEqual(requests, [
        {
          model: 'claude-opus-4-7',
          max_tokens: 1,
          messages: [{ role: 'user', content: '.' }],
        },
      ])
    }
  },
)

test(
  'Bedrock and Vertex source probes own the authenticated normalization contract',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const fragment = "model: model.replace(/\\[1m\\]$/i, '')"
    for (const relative of [
      'components/BedrockSetupWizard.tsx',
      'components/VertexSetupWizard.tsx',
    ]) {
      const source = fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
      assert.equal(occurrences(source, fragment), 1, relative)
      assert.match(
        source,
        /export async function probe(?:Bedrock|Vertex)Model\([\s\S]*?messages\.create\(\{[\s\S]*?model: model\.replace\(\/\\\[1m\\\]\$\/i, ''\),[\s\S]*?max_tokens: 1/,
        relative,
      )
    }

    const bedrock = fs.readFileSync(
      path.join(sourceRoot, 'components/BedrockSetupWizard.tsx'),
      'utf8',
    )
    const vertex = fs.readFileSync(
      path.join(sourceRoot, 'components/VertexSetupWizard.tsx'),
      'utf8',
    )
    assert.match(bedrock, /function with1mSuffix\(model: string\): string \{[\s\S]*?\/\\\[1m\\\]\$\/i\.test\(model\) \? model : `\$\{model\}\[1m\]`/)
    assert.match(vertex, /function with1mSuffix\(model: string\): string \{[\s\S]*?\/\\\[1m\\\]\$\/i\.test\(model\) \? model : `\$\{model\}\[1m\]`/)
    assert.ok(bedrock.includes('Bedrock configuration saved to ~/.claude/settings.json.'))
    assert.ok(vertex.includes('Vertex AI configuration saved to ~/.claude/settings.json.'))
    assert.ok(bedrock.includes('These will be written to ~/.claude/settings.json under env:'))
    assert.ok(vertex.includes('These will be written to ~/.claude/settings.json under env:'))

    const normalize = model => model.replace(/\[1m\]$/i, '')
    assert.equal(normalize('claude-opus-4-7[1m]'), 'claude-opus-4-7')
    assert.equal(normalize('claude-opus-4-7[1M]'), 'claude-opus-4-7')
    assert.equal(
      normalize('claude-opus-4-7[1m]-preview'),
      'claude-opus-4-7[1m]-preview',
    )
  },
)

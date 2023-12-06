#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  contextualTokenLines,
  generatedSpan,
  tokenizeBundle,
} from '../lib/tokenize.mjs'
import {
  loadSelectedMappings,
  originalPositionFor,
} from '../lib/source-map.mjs'

function usage() {
  console.error(
    'Usage: analyze-bundles.mjs --baseline BUNDLE --map BASELINE.map ' +
      '--target BUNDLE --output DIR',
  )
}

function parseArguments(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith('--')) throw new Error(`Unexpected ${argument}`)
    const key = argument.slice(2)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`)
    }
    result[key] = value
    index += 1
  }
  return result
}

function sha256Buffer(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function fileEvidence(filename) {
  const buffer = fs.readFileSync(filename)
  return {
    path: path.resolve(filename),
    bytes: buffer.length,
    sha256: sha256Buffer(buffer),
  }
}

function tokenHash(tokens) {
  const hash = crypto.createHash('sha256')
  for (const token of tokens) hash.update(token.signature).update('\0')
  return hash.digest('hex')
}

function parseHunks(diff) {
  const hunks = []
  const expression =
    /^@@ -(?<oldStart>\d+)(?:,(?<oldCount>\d+))? \+(?<newStart>\d+)(?:,(?<newCount>\d+))? @@/gm
  let match
  while ((match = expression.exec(diff)) !== null) {
    const oldCount =
      match.groups.oldCount === undefined ? 1 : Number(match.groups.oldCount)
    const newCount =
      match.groups.newCount === undefined ? 1 : Number(match.groups.newCount)
    hunks.push({
      oldStart: Number(match.groups.oldStart),
      oldCount,
      newStart: Number(match.groups.newStart),
      newCount,
    })
  }
  return hunks
}

function tokenSlice(tokens, oneBasedStart, count) {
  if (count === 0) return []
  return tokens.slice(oneBasedStart - 1, oneBasedStart - 1 + count)
}

function sourceCandidatesForHunk(hunk, baseline, mappings) {
  const contextRadius = 12
  const zeroBasedStart = Math.max(0, hunk.oldStart - 1)
  const start = Math.max(0, zeroBasedStart - contextRadius)
  const end = Math.min(
    baseline.tokens.length,
    zeroBasedStart + hunk.oldCount + contextRadius,
  )
  const bySource = new Map()

  for (const token of baseline.tokens.slice(start, end)) {
    const original = originalPositionFor(
      mappings,
      token.line,
      token.column,
    )
    if (!original?.source) continue
    const current = bySource.get(original.source) ?? {
      source: original.source,
      hits: 0,
      originalLines: [],
      generatedLines: [],
    }
    current.hits += 1
    current.originalLines.push(original.originalLine + 1)
    current.generatedLines.push(token.line + 1)
    bySource.set(original.source, current)
  }

  return [...bySource.values()]
    .map(candidate => ({
      source: candidate.source,
      hits: candidate.hits,
      originalLineStart: Math.min(...candidate.originalLines),
      originalLineEnd: Math.max(...candidate.originalLines),
      generatedLineStart: Math.min(...candidate.generatedLines),
      generatedLineEnd: Math.max(...candidate.generatedLines),
    }))
    .sort((left, right) => right.hits - left.hits)
}

function ensureEmptyDirectory(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true })
    return
  }
  const status = fs.lstatSync(directory)
  if (!status.isDirectory() || status.isSymbolicLink()) {
    throw new Error(`Output is not a real directory: ${directory}`)
  }
  const entries = fs.readdirSync(directory)
  if (entries.length > 0) {
    throw new Error(
      `Refusing to clear non-empty output directory: ${directory} ` +
        `(${entries[0]})`,
    )
  }
}

async function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args.baseline || !args.map || !args.target || !args.output) {
    usage()
    process.exitCode = 2
    return
  }

  const baselinePath = path.resolve(args.baseline)
  const mapPath = path.resolve(args.map)
  const targetPath = path.resolve(args.target)
  const outputPath = path.resolve(args.output)
  const contextualRadius =
    args.radius === undefined ? 0 : Number.parseInt(args.radius, 10)
  if (!Number.isInteger(contextualRadius) || contextualRadius < 0) {
    throw new Error('--radius must be a non-negative integer')
  }
  const identifierMode = args['identifier-mode'] ?? 'semantic'
  if (!['all', 'semantic'].includes(identifierMode)) {
    throw new Error('--identifier-mode must be `all` or `semantic`')
  }
  const normalizeShorthand = args['normalize-shorthand'] === 'true'
  if (identifierMode === 'all' || normalizeShorthand) {
    console.error(
      'WARNING: requested canonicalization can hide semantic changes; ' +
        'this command is only an exploratory locator, never a verifier.',
    )
  }
  const snippetsPath = path.join(outputPath, 'hunks')
  ensureEmptyDirectory(outputPath)
  fs.mkdirSync(snippetsPath, { recursive: true })

  console.error('Tokenizing baseline bundle...')
  const baseline = await tokenizeBundle(baselinePath, {
    identifierMode,
    normalizeShorthand,
  })
  console.error('Tokenizing target bundle...')
  const target = await tokenizeBundle(targetPath, {
    identifierMode,
    normalizeShorthand,
  })

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-recovery-'))
  const baselineTokensPath = path.join(temporary, 'baseline.tokens')
  const targetTokensPath = path.join(temporary, 'target.tokens')

  try {
    fs.writeFileSync(
      baselineTokensPath,
      `${contextualTokenLines(baseline.tokens, contextualRadius).join('\n')}\n`,
    )
    fs.writeFileSync(
      targetTokensPath,
      `${contextualTokenLines(target.tokens, contextualRadius).join('\n')}\n`,
    )

    console.error('Aligning canonical token streams...')
    const diffResult = spawnSync(
      'git',
      [
        'diff',
        '--no-index',
        '--no-renames',
        '--unified=0',
        '--histogram',
        '--',
        baselineTokensPath,
        targetTokensPath,
      ],
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
    )
    if (diffResult.status !== 0 && diffResult.status !== 1) {
      throw new Error(diffResult.stderr || 'git diff failed')
    }

    const hunks = parseHunks(diffResult.stdout)
    const requestedLines = new Set()
    for (const hunk of hunks) {
      const start = Math.max(0, hunk.oldStart - 1 - 12)
      const end = Math.min(
        baseline.tokens.length,
        hunk.oldStart - 1 + hunk.oldCount + 12,
      )
      for (const token of baseline.tokens.slice(start, end)) {
        requestedLines.add(token.line)
      }
    }

    console.error('Attributing changed ranges through the baseline source map...')
    const mappings = loadSelectedMappings(mapPath, requestedLines)
    const reportHunks = []

    for (let index = 0; index < hunks.length; index += 1) {
      const hunk = hunks[index]
      const oldIndex = Math.max(0, hunk.oldStart - 1)
      const newIndex = Math.max(0, hunk.newStart - 1)
      const before = generatedSpan(baseline, oldIndex, hunk.oldCount)
      const after = generatedSpan(target, newIndex, hunk.newCount)
      const identifier = String(index + 1).padStart(4, '0')
      const beforeName = `hunk-${identifier}.before.js`
      const afterName = `hunk-${identifier}.after.js`
      fs.writeFileSync(path.join(snippetsPath, beforeName), before.text)
      fs.writeFileSync(path.join(snippetsPath, afterName), after.text)

      const oldTokens = tokenSlice(
        baseline.tokens,
        hunk.oldStart,
        hunk.oldCount,
      )
      const newTokens = tokenSlice(target.tokens, hunk.newStart, hunk.newCount)
      reportHunks.push({
        id: Number(identifier),
        baselineTokenStart: hunk.oldStart,
        baselineTokenCount: hunk.oldCount,
        targetTokenStart: hunk.newStart,
        targetTokenCount: hunk.newCount,
        baselineGenerated: {
          start: before.start,
          end: before.end,
          sha256: sha256Buffer(before.text),
          snippet: `hunks/${beforeName}`,
        },
        targetGenerated: {
          start: after.start,
          end: after.end,
          sha256: sha256Buffer(after.text),
          snippet: `hunks/${afterName}`,
        },
        baselineNormalizedSha256: tokenHash(oldTokens),
        targetNormalizedSha256: tokenHash(newTokens),
        sourceCandidates: sourceCandidatesForHunk(
          hunk,
          baseline,
          mappings,
        ),
      })
    }

    const applicationSources = new Map()
    for (const hunk of reportHunks) {
      for (const candidate of hunk.sourceCandidates) {
        if (!candidate.source.includes('/src/')) continue
        const current = applicationSources.get(candidate.source) ?? {
          source: candidate.source,
          hunkIds: [],
          hits: 0,
        }
        current.hunkIds.push(hunk.id)
        current.hits += candidate.hits
        applicationSources.set(candidate.source, current)
      }
    }

    const report = {
      schemaVersion: 1,
      kind: 'exploratory-normalized-token-diff',
      claim:
        'Candidate-location evidence only; every hunk requires independent strict verification.',
      createdAt: new Date().toISOString(),
      baseline: {
        bundle: fileEvidence(baselinePath),
        sourceMap: fileEvidence(mapPath),
        tokenCount: baseline.tokens.length,
        normalizedTokenSha256: tokenHash(baseline.tokens),
      },
      target: {
        bundle: fileEvidence(targetPath),
        tokenCount: target.tokens.length,
        normalizedTokenSha256: tokenHash(target.tokens),
      },
      canonicalization: {
        version: baseline.canonicalizationVersion,
        identifierMode,
        normalizeShorthand,
        contextualRadius,
        description:
          identifierMode === 'all'
            ? 'Acorn tokens; all identifiers alpha-normalized (unsafe for verification).'
            : 'Acorn tokens; minifier-like identifiers alpha-normalized; ' +
              'property identifiers and stable long identifiers preserved.',
        limitations: [
          'Identifier normalization is not scope-aware and can conceal binding changes.',
          'Shorthand normalization can conceal property-value changes.',
          'A reported correspondence is not evidence of semantic equivalence.',
        ],
      },
      summary: {
        hunkCount: reportHunks.length,
        baselineChangedTokenCount: reportHunks.reduce(
          (sum, hunk) => sum + hunk.baselineTokenCount,
          0,
        ),
        targetChangedTokenCount: reportHunks.reduce(
          (sum, hunk) => sum + hunk.targetTokenCount,
          0,
        ),
        attributedApplicationSourceCount: applicationSources.size,
      },
      applicationSources: [...applicationSources.values()].sort(
        (left, right) => right.hits - left.hits,
      ),
      hunks: reportHunks,
    }

    fs.writeFileSync(
      path.join(outputPath, 'report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    )
    fs.writeFileSync(path.join(outputPath, 'tokens.diff'), diffResult.stdout)

    console.log(JSON.stringify(report.summary, null, 2))
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error.stack ?? error)
  process.exitCode = 1
})

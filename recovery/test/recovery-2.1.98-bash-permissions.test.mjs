import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url))
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_98_BUNDLE
const BASELINE_BUNDLE_SHA256 =
  '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'
const TARGET_BUNDLE_SHA256 =
  '27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556'

function source(relativePath) {
  return fs.readFileSync(`${sourceRoot}${relativePath}`, 'utf8')
}

function requiredBundle(filename, label, expectedSha256) {
  assert.ok(filename, `${label} environment variable must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedSha256,
  )
  return bytes.toString('utf8')
}

test('recovers shared grep-family flag validation', () => {
  const validation = source('tools/BashTool/readOnlyValidation.ts')
  const shared = source('utils/shell/readOnlyCommandValidation.ts')

  assert.match(
    validation,
    /const GREP_SAFE_FLAGS:[\s\S]*?'-I': 'none'[\s\S]*?grep: \{\s*safeFlags: GREP_SAFE_FLAGS,\s*\},\s*egrep: \{\s*safeFlags: GREP_SAFE_FLAGS,\s*\},\s*fgrep: \{\s*safeFlags: GREP_SAFE_FLAGS,/,
  )
  assert.match(
    validation,
    /const SAFE_TARGET_COMMANDS_FOR_XARGS = \[[\s\S]*?'grep',[\s\S]*?'egrep',[\s\S]*?'fgrep'/,
  )
  assert.match(
    validation,
    /tokens\[0\] === 'grep' \|\|[\s\S]*?tokens\[0\] === 'egrep' \|\|[\s\S]*?tokens\[0\] === 'fgrep'/,
  )
  assert.match(
    shared,
    /options\?\.commandName === 'grep' \|\|[\s\S]*?options\?\.commandName === 'egrep' \|\|[\s\S]*?options\?\.commandName === 'fgrep' \|\|[\s\S]*?options\?\.commandName === 'rg'/,
  )
})

test('recovers argv-aware printf, test, and find classification', () => {
  const validation = source('tools/BashTool/readOnlyValidation.ts')

  assert.match(
    validation,
    /const FIND_DANGEROUS_PREDICATES = new Set\(\[[\s\S]*?'-delete'[\s\S]*?'-exec'[\s\S]*?'-fprintf'/,
  )
  assert.match(
    validation,
    /const FIND_ARGUMENT_PREDICATES = new Set\(\[[\s\S]*?'-name'[\s\S]*?'-newer'[\s\S]*?'-printf'[\s\S]*?'-D'/,
  )
  assert.match(
    validation,
    /if \(command === 'printf'\)[\s\S]*?return !argv\[1\]\?\.startsWith\('-v'\)/,
  )
  assert.match(
    validation,
    /if \(command === '\[\['\)[\s\S]*?\(arg === '-v' \|\| arg === '-R'\)[\s\S]*?includes\('\['\)[\s\S]*?TEST_ARITHMETIC_COMPARISON_OPERATORS\.has\(arg\)/,
  )
  assert.match(
    validation,
    /if \(command === 'find'\)[\s\S]*?FIND_ARGUMENT_PREDICATES\.has\(arg\)[\s\S]*?FIND_DANGEROUS_PREDICATES\.has\(arg\)/,
  )
  assert.ok(validation.includes('/^-newer[aBcmt]{2}$/'))
})

test('recovers bracket-aware unquoted-glob scanning', () => {
  const validation = source('tools/BashTool/readOnlyValidation.ts')

  assert.match(validation, /let inGlobBracket = false/)
  assert.match(
    validation,
    /currentChar === ' ' \|\|[\s\S]*?currentChar === '\\t' \|\|[\s\S]*?currentChar === '>'[\s\S]*?inGlobBracket = false/,
  )
  assert.match(
    validation,
    /currentChar === '\['[\s\S]*?inGlobBracket = true[\s\S]*?currentChar === '\]' && inGlobBracket[\s\S]*?return true/,
  )
})

test('authenticated adjacent bundles contain the Bash hardening', () => {
  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_97_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_98_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )

  assert.equal(baseline.includes('egrep'), false)
  assert.equal(baseline.includes('fgrep'), false)
  assert.equal(target.includes('egrep'), true)
  assert.equal(target.includes('fgrep'), true)
  assert.match(
    target,
    /grep:\{safeFlags:([A-Za-z_$][\w$]*)\},egrep:\{safeFlags:\1\},fgrep:\{safeFlags:\1\}/,
  )
  assert.match(
    target,
    /\["echo","printf","wc","grep","egrep","fgrep","head","tail"\]/,
  )
  assert.match(
    target,
    /if\([A-Za-z_$][\w$]*==="printf"\)return![A-Za-z_$][\w$]*\[1\]\?\.startsWith\("-v"\)/,
  )
  assert.match(
    target,
    /\(z==="-v"\|\|z==="-R"\)&&q\[[A-Za-z_$][\w$]*\+1\]\?\.includes\("\["\)/,
  )
  assert.ok(target.includes('/^-newer[aBcmt]{2}$/'))
  assert.match(
    target,
    /commandName==="grep"\|\|[A-Za-z_$][\w$]*\?\.commandName==="egrep"\|\|[A-Za-z_$][\w$]*\?\.commandName==="fgrep"\|\|[A-Za-z_$][\w$]*\?\.commandName==="rg"/,
  )
})

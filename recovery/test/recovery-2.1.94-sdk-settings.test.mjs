import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url))
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_94_BUNDLE
const BASELINE_BUNDLE_SHA256 =
  '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362'
const TARGET_BUNDLE_SHA256 =
  '11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564'

function readSource(relativePath) {
  const source = fs.readFileSync(`${sourceRoot}${relativePath}`, 'utf8')
  const sourceMap = source.indexOf('//# sourceMappingURL=')
  return sourceMap === -1 ? source : source.slice(0, sourceMap)
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

function publicErrors(errors) {
  const result = errors
    .filter(error => error.severity !== 'warning')
    .map(({ file, path, message }) => ({ file, path, message }))
  return result.length > 0 ? result : undefined
}

test('projects non-warning settings failures into get_settings responses', () => {
  assert.deepEqual(
    publicErrors([
      {
        file: '/tmp/settings.json',
        path: 'permissions.allow',
        message: 'Expected array',
        severity: 'fatal',
        invalidValue: 42,
      },
      {
        file: '/tmp/settings.json',
        path: 'futureSetting',
        message: 'Ignored warning',
        severity: 'warning',
      },
    ]),
    [
      {
        file: '/tmp/settings.json',
        path: 'permissions.allow',
        message: 'Expected array',
      },
    ],
  )
  assert.equal(publicErrors([]), undefined)

  const schemas = readSource('entrypoints/sdk/controlSchemas.ts')
  const print = readSource('cli/print.ts')
  assert.match(schemas, /export const SettingsValidationErrorSchema/)
  assert.match(
    schemas,
    /file: z[\s\S]*?\.optional\(\)[\s\S]*?Path to the settings file that failed to parse or validate\./,
  )
  assert.match(
    schemas,
    /Dot-notation path to the field with the error, or empty string for whole-file errors\./,
  )
  assert.match(schemas, /message: z\.string\(\)\.describe\('Human-readable error message\.'\)/)
  assert.match(
    schemas,
    /errors: z[\s\S]*?\.array\(SettingsValidationErrorSchema\(\)\)[\s\S]*?Settings parse and validation errors\./,
  )
  assert.match(print, /getSettingsWithErrors,/)
  assert.match(
    print,
    /getSettingsWithErrors\(\)[\s\S]*?\.errors\.filter\(error => error\.severity !== 'warning'\)[\s\S]*?\.map\(\(\{ file, path, message \}\) => \(\{ file, path, message \}\)\)/,
  )
  assert.match(print, /errors: errors\.length > 0 \? errors : undefined/)
})

test('adjacent bundles authenticate the settings-error schema and response', () => {
  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_92_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_94_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )
  const description =
    'Settings parse and validation errors. When non-empty, the listed files were skipped during the merge above — their settings are not reflected in `effective` or `sources`.'
  assert.equal(baseline.includes(description), false)
  assert.equal(target.includes(description), true)
  assert.equal(
    target.includes(
      'Dot-notation path to the field with the error, or empty string for whole-file errors.',
    ),
    true,
  )
  assert.match(
    target,
    /\.errors\.filter\(\([A-Za-z_$][\w$]*\)=>[A-Za-z_$][\w$]*\.severity!=="warning"\)\.map/,
  )
})

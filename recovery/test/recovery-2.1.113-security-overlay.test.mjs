import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { extractBashCommentLabel } from '../../src/tools/BashTool/commentLabel.ts'

function source(relative) {
  return fs.readFileSync(
    fileURLToPath(new URL(`../../${relative}`, import.meta.url)),
    'utf8',
  )
}

test('merges explicit denied sandbox domains from every settings source', () => {
  const schema = source('src/entrypoints/sandboxTypes.ts')
  assert.match(
    schema,
    /deniedDomains:\s+z\s+\.array\(z\.string\(\)\)\s+\.optional\(\)/,
  )
  assert.match(
    schema,
    /Domains that are always blocked, even if matched by allowedDomains\./,
  )

  const adapter = source('src/utils/sandbox/sandbox-adapter.ts')
  const explicitDeny =
    'for (const domain of settings.sandbox?.network?.deniedDomains || [])'
  const permissionDeny = 'for (const ruleString of permissions.deny || [])'
  assert.ok(adapter.includes(explicitDeny))
  assert.ok(adapter.indexOf(explicitDeny) < adapter.indexOf(permissionDeny))
  assert.match(
    adapter,
    /settings\.sandbox\?\.network\?\.deniedDomains \|\| \[\]\) \{\s+deniedDomains\.push\(domain\)/,
  )
})

test('does not let a first-line comment hide executable transcript content', () => {
  assert.equal(extractBashCommentLabel('# Run tests'), 'Run tests')
  assert.equal(
    extractBashCommentLabel('# Explain the next step\n\n  # more context'),
    'Explain the next step',
  )
  assert.equal(
    extractBashCommentLabel('# Harmless summary\nrm -rf important-data'),
    undefined,
  )
  assert.equal(extractBashCommentLabel('# label\necho hidden'), undefined)
  assert.equal(extractBashCommentLabel('#!/bin/bash\necho visible'), undefined)
  assert.equal(extractBashCommentLabel('# safe\u0000spoof'), undefined)
  assert.equal(extractBashCommentLabel('# safe\u0085spoof'), undefined)
})

test('normalizes macOS private system aliases before dangerous removal checks', () => {
  const validation = source('src/utils/permissions/pathValidation.ts')
  assert.match(validation, /getPlatform\(\) === 'macos'/)
  assert.match(
    validation,
    /replace\(\/\^\\\/private\\\/\(etc\|var\|tmp\|home\)\(\\\/\|\$\)\/i, '\/\$1\$2'\)/,
  )
  assert.match(
    validation,
    /normalizeMacOSPrivatePath\(forwardSlashed\)/,
  )
  assert.match(
    validation,
    /normalizeMacOSPrivatePath\(\s+homedir\(\)\.replace\(\/\[\\\\\/\]\+\/g, '\/'\),\s+\)/,
  )
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const releases = [
  ['2.1.121', process.env.CLAUDE_CODE_2_1_121_BUNDLE],
  ['2.1.122', process.env.CLAUDE_CODE_2_1_122_BUNDLE],
]

test('authenticates retained tracked speculation write and mirror', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')
    const exportMatch = bundle.match(/trackSessionWrite:\(\)=>([\w$]+)/)
    assert.ok(exportMatch, `${version}: retained tracking export`)
    const helper = exportMatch[1]
    assert.equal(
      bundle.split(helper).length - 1,
      3,
      `${version}: export, definition and speculation caller`,
    )
    assert.match(
      bundle,
      new RegExp(
        `function ${helper.replaceAll('$', '\\$')}\\([\\w$]+\\)\\{return [\\w$]+\\(\\)\\.trackExternalWrite\\([\\w$]+\\)\\}`,
      ),
    )

    const marker = bundle.indexOf('type:"speculation-accept"')
    assert.notEqual(marker, -1, `${version}: speculation entry`)
    const witness = bundle.slice(marker, marker + 700)
    assert.match(
      witness,
      new RegExp(
        `${helper.replaceAll('$', '\\$')}\\(\\(\\)=>[\\w$]+\\.appendFile\\([\\w$]+\\(\\),[\\w$]+\\([\\w$]+\\)\\+\`\\n\`,\\{mode:384\\}\\)\\.then\\(\\(\\)=>\\{[\\w$]+\\([\\w$]+\\(\\),\\[[\\w$]+\\]\\)\\}\\)\\)`,
      ),
      `${version}: tracked append mirrors the entry after success`,
    )
  }
})

test('source tracks and mirrors the direct speculation append', () => {
  const storage = readFileSync(
    new URL('../../src/utils/sessionStorage.ts', import.meta.url),
    'utf8',
  )
  const speculation = readFileSync(
    new URL(
      '../../src/services/PromptSuggestion/speculation.ts',
      import.meta.url,
    ),
    'utf8',
  )

  assert.match(
    storage,
    /export function trackSessionWrite[\s\S]*?getProject\(\)\.trackExternalWrite\(write\)/,
  )
  assert.match(
    storage,
    /trackExternalWrite<T>[\s\S]*?return this\.trackWrite\(write\)/,
  )
  assert.match(
    speculation,
    /trackSessionWrite\(\(\) =>[\s\S]*?appendFile\(getTranscriptPath\(\)[\s\S]*?\.then\(\(\) => \{\s*fireSessionMirror\(getTranscriptPath\(\), \[entry\]\)/,
  )
  assert.equal(
    speculation.split('trackSessionWrite(').length - 1,
    1,
    'one tracked external write',
  )
})

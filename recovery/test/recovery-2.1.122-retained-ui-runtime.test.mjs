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
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

function count(haystack, needle) {
  return haystack.split(needle).length - 1
}

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

function readSource(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

test('authenticates retained overlay, repin diagnostics, and status rendering', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const [needle, expected] of [
      ['ultrareview-launch', 1],
      ['repinScroll(', 1],
      ['lastMsgIsHuman', 1],
      ['typedIntoEmpty', 1],
      ['permissionDialogAppear', 1],
      ['permissionDialogDismiss', 1],
      ['toolJsxDialog\\u2192', 1],
      ['System diagnostics', 1],
    ]) {
      assert.equal(
        count(bundle, needle),
        expected,
        `${release.version}: ${needle} cardinality`,
      )
    }

    assert.match(bundle, /\("ultrareview-launch"\)/)
    assert.match(
      bundle,
      /`repinScroll\(\$\{[^}]+\}, force=\$\{[^}]+\}\): yanking from scrollTop=\$\{[^}]+\.getScrollTop\(\)\} \(max=\$\{Math\.max\(0,[^}]+\.getScrollHeight\(\)-[^}]+\.getViewportHeight\(\)\)\}\)`/,
    )
    assert.match(bundle, /\(!1,"onSubmit"\)/)
    assert.match(bundle, /\{status:"warning"\}/)
  }
})

test('source restores the retained overlay and repin reason plumbing', () => {
  const overage = readSource(
    'src/commands/review/UltrareviewOverageDialog.tsx',
  )
  assert.match(overage, /useRegisterOverlay\('ultrareview-launch'\)/)

  const repl = readSource('src/screens/REPL.tsx')
  assert.match(repl, /const cursorRef = useRef\(cursor\)/)
  assert.match(repl, /cursorRef\.current = cursor/)
  assert.match(
    repl,
    /const repinScroll = useCallback\(\(force = false, reason = '\?'\) =>/,
  )
  assert.match(repl, /if \(scrollHandle && !scrollHandle\.isSticky\(\)\)/)
  assert.match(
    repl,
    /`repinScroll\(\$\{reason\}, force=\$\{force\}\): yanking from scrollTop=\$\{scrollHandle\.getScrollTop\(\)\} \(max=\$\{Math\.max\(0, scrollHandle\.getScrollHeight\(\) - scrollHandle\.getViewportHeight\(\)\)\}\)`/,
  )
  assert.match(repl, /if \(cursorRef\.current !== null\) setCursor\(null\)/)
  for (const reason of [
    'lastMsgIsHuman',
    'typedIntoEmpty',
    'permissionDialogAppear',
    'permissionDialogDismiss',
    'onSubmit',
  ]) {
    assert.equal(count(repl, `'${reason}'`), 1, `${reason}: source cardinality`)
  }
  assert.match(repl, /`toolJsxDialog→\$\{hasToolJsx\}`/)
})

test('source restores exact retained status diagnostics presentation', () => {
  const status = readSource('src/components/Settings/Status.tsx')
  assert.match(status, /import \{ StatusIcon \}/)
  assert.equal(count(status, '>System diagnostics<'), 1)
  assert.match(status, /<StatusIcon status="warning" \/>/)
  assert.doesNotMatch(status, /figures\.warning/)
})

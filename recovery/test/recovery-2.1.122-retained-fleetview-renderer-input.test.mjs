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

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
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

test('authenticates the retained FleetView and hyperlink contracts', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const [fragment, expected] of [
      ['ctrl+s to switch views', 1],
      ['no job focused', 1],
      ['stopped. ctrl+x again to delete.', 1],
      ['describe a task for a new session', 1],
      ['Press Ctrl-C again to exit', 1],
      ['hyperlinkUrl', 3],
      ['allowDefault', 2],
      ['defaultAllowed', 5],
    ]) {
      assert.equal(
        occurrences(bundle, fragment),
        expected,
        `${release.version}: ${fragment}`,
      )
    }
  }
})

test('restores the full FleetView renderer, child detail, and link route', () => {
  const fleet = compact(source('src/components/FleetView.tsx'))
  for (const fragment of [
    '<ScrollBox ref={scrollBoxRef} flexGrow={1} flexDirection="column" stickyScroll >',
    '<Clawd />',
    '<Text bold>Claude Code</Text>',
    '<Text color="claude" bold>Agents</Text>',
    "shortcuts.push('ctrl+s to switch views')",
    '<Text dimColor>no job focused</Text>',
    '<FleetChildDetailRow key={child.row.href} child={child} />',
    '<Link url={child.row.href}>{child.label}</Link>',
    '<Link url={`${child.row.href}/files`}>',
    "const resultLink = result ? fleetResultLink(result) : null",
    'if (event.hyperlinkUrl) { event.allowDefault() return }',
    "ink.onHyperlinkClick = url => { if (url.startsWith('file:'))",
    '!/\\w/.test(value[index + href.length] ?? \'\') && value.length - href.length < 16',
    'const maxChildren = Math.max( 8, rows - 8 - reservedRows, )',
    '<FleetRichText value={cleanFleetText(value)} />',
    'onKeyDown={handleFleetKeyDown}',
    'onPaste={handleFleetPaste}',
    'onWheel={event => { if (detail) return',
  ]) {
    assert.ok(fleet.includes(compact(fragment)), fragment)
  }
})

test('restores Fleet keyboard ownership and target ordering', () => {
  const fleet = compact(source('src/components/FleetView.tsx'))
  for (const fragment of [
    'const claim = (): void => { event.preventDefault() event.stopImmediatePropagation() }',
    'if (attachingJobId !== null) { claim()',
    'if (showHelp || showInfo) { setShowHelp(false) setShowInfo(false) return }',
    'if (detail) setDetail(false) else if (showHelp) setShowHelp(false)',
    'let next = (current + direction + rows.length) % rows.length',
    'autocomplete.suggestions.length === 0 && !detail',
    'if (!queryRef.current && templates.length) { setShowAllSuggestions(value => !value) return }',
    'if (key.rightArrow && !key.shift && !queryRef.current)',
    "normalizedQuery === '/exit' || normalizedQuery === '/quit'",
    "['exit', 'quit', ':q', ':q!', ':wq', ':wq!']",
    'isActive: !detail && renameId === null && attachingJobId === null',
    'onSpaceOnEmpty: () => { setShowAllSuggestions(false)',
  ]) {
    assert.ok(fleet.includes(compact(fragment)), fragment)
  }
})

test('restores SearchBox cursor rendering and click positioning', () => {
  const search = compact(source('src/components/SearchBox.tsx'))
  const input = compact(source('src/hooks/useSearchInput.ts'))
  for (const fragment of [
    'highlights?: readonly SearchHighlight[]',
    'dimRange?: SearchHighlight',
    'cursorChar?: React.ReactNode',
    'onCursorOffsetChange?: (offset: number) => void',
    'cursor.measuredText.getOffsetFromPosition({ line: row, column })',
    'color={isHighlighted(start) ? \'suggestion\' : undefined}',
    'inverse={atCursor}',
  ]) {
    assert.ok(search.includes(compact(fragment)), fragment)
  }
  for (const fragment of [
    'const queryRef = useRef(query)',
    'const cursorOffsetRef = useRef(cursorOffset)',
    "if (onSpaceOnEmpty && e.key === ' ' && currentQuery === '')",
    "const text = multiline ? e.text.replace(/\\r\\n|\\r/g, '\\n')",
    'setCursorOffset: updateCursorOffset',
  ]) {
    assert.ok(input.includes(compact(fragment)), fragment)
  }
})

test('restores ClickEvent default-yield semantics through Ink dispatch', () => {
  const event = compact(source('src/ink/events/click-event.ts'))
  const hitTest = compact(source('src/ink/hit-test.ts'))
  const ink = compact(source('src/ink/ink.tsx'))
  for (const fragment of [
    'readonly hyperlinkUrl: string | undefined',
    'defaultAllowed = false',
    'allowDefault(): void { this.defaultAllowed = true }',
    'this.hyperlinkUrl = hyperlinkUrl',
  ]) {
    assert.ok(event.includes(compact(fragment)), fragment)
  }
  for (const fragment of [
    'event.defaultAllowed = false',
    'if (event.didStopImmediatePropagation()) return !event.defaultAllowed',
    'if (!event.defaultAllowed) handled = true',
  ]) {
    assert.ok(hitTest.includes(compact(fragment)), fragment)
  }
  assert.ok(
    ink.includes(
      compact(
        'const hyperlinkUrl = this.getHyperlinkAt(col, row); return dispatchClick(this.rootNode, col, row, blank, hyperlinkUrl);',
      ),
    ),
  )
})

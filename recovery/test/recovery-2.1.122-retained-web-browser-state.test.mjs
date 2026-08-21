import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const releases = [
  ['2.1.121', process.env.CLAUDE_CODE_2_1_121_BUNDLE],
  ['2.1.122', process.env.CLAUDE_CODE_2_1_122_BUNDLE],
]

function occurrences(text, needle) {
  return text.split(needle).length - 1
}

function source(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8').replace(
    /\s+/g,
    ' ',
  )
}

test('authenticates retained WebBrowser state and updater exports', () => {
  for (const [version, path] of releases) {
    assert.ok(path, `${version} authenticated bundle path required`)
    const bundle = readFileSync(path, 'utf8')

    assert.equal(occurrences(bundle, 'makeSetWebBrowserSlice'), 1, version)
    assert.equal(occurrences(bundle, 'getDefaultWebBrowserState'), 3, version)
    assert.equal(occurrences(bundle, 'webBrowser'), 6, version)
    assert.equal(
      occurrences(
        bundle,
        'view:void 0,logs:[],unreadErrors:0,unreadWarnings:0,cleanupRegistered:!1',
      ),
      1,
      `${version}: exact retained default state`,
    )
    assert.match(
      bundle,
      /\{makeSetWebBrowserSlice:\(\)=>[A-Za-z_$][\w$]*,getDefaultWebBrowserState:\(\)=>[A-Za-z_$][\w$]*\}/,
      `${version}: both helpers remain in the module namespace`,
    )
    assert.match(
      bundle,
      /let [A-Za-z_$][\w$]*=\{webBrowser:[A-Za-z_$][\w$]*\.webBrowser,bagelActive:[A-Za-z_$][\w$]*\.bagelActive,bagelUrl:[A-Za-z_$][\w$]*\.bagelUrl,bagelPanelVisible:[A-Za-z_$][\w$]*\.bagelPanelVisible\},[A-Za-z_$][\w$]*=[A-Za-z_$][\w$]*\([A-Za-z_$][\w$]*\);if\([A-Za-z_$][\w$]*===[A-Za-z_$][\w$]*\)return [A-Za-z_$][\w$]*;return\{\.\.\.[A-Za-z_$][\w$]*,\.\.\.[A-Za-z_$][\w$]*\}/,
      `${version}: updater preserves identity and merges the complete slice`,
    )
  }
})

test('source reconstructs defaults, startup, and headless inheritance', () => {
  const browser = source('src/utils/webBrowserState.ts')
  const state = source('src/state/AppStateStore.ts')
  const main = source('src/main.tsx')

  for (const witness of [
    'view: undefined',
    'logs: []',
    'unreadErrors: 0',
    'unreadWarnings: 0',
    'cleanupRegistered: false',
    'webBrowser: previous.webBrowser',
    'bagelActive: previous.bagelActive',
    'bagelUrl: previous.bagelUrl',
    'bagelPanelVisible: previous.bagelPanelVisible',
    'return next === slice ? previous : { ...previous, ...next }',
  ]) {
    assert.ok(browser.includes(witness), `missing browser-state witness: ${witness}`)
  }

  assert.ok(state.includes('webBrowser: WebBrowserState'))
  assert.ok(state.includes('webBrowser: getDefaultWebBrowserState()'))
  assert.ok(main.includes('webBrowser: getDefaultWebBrowserState()'))
  assert.match(
    main,
    /const defaultState = getDefaultAppState\(\); const headlessInitialState: AppState = \{ \.\.\.defaultState,/,
    'headless constructor inherits the retained default slice',
  )
})

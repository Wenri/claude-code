import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.107-to-2.1.108'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historical = semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_107_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_108_BUNDLE
const latestBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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

const targetUnits = new Map([
  [5405, [3985848, 3987829, '0eade8dcc95c13cb3b6e5c4c5fc369dd75eddbb3df967957d220e33b2420fd41']],
  [5650, [4075833, 4076078, '230de3d11d759bc8d34ec3960fd0939e1824ec0087c147308c6b2e47fabbdf24']],
  [5652, [4076589, 4077057, '963d5574399d3f780323b70a96366060d1b67c3ecb8c2ea2042e2c96a0e14c94']],
  [5820, [4180021, 4180420, 'ab0f5e5b3f52fbbef48c182d79a8681ef199115adae5426c4da93ec6c99d4458']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function compact(value) {
  return value.replace(/\s+/g, ' ')
}

function assertFragments(value, fragments, owner) {
  for (const fragment of fragments) {
    assert.ok(value.includes(fragment), `${owner}: ${fragment}`)
  }
}

test(
  'target108 authenticates the complete focus/click introduction boundary',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetBundlePath
        ? 'CLAUDE_CODE_2_1_108_BUNDLE is required'
        : false,
  },
  () => {
    const bytes = fs.readFileSync(targetBundlePath)
    assert.equal(
      sha256(bytes),
      'dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73',
    )
    const bundle = bytes.toString('utf8')
    for (const [index, identity] of targetUnits) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: classification`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        identity,
        `${index}: identity`,
      )
      assert.equal(
        sha256(bundle.slice(identity[0], identity[1])),
        identity[2],
        `${index}: bytes`,
      )
    }
    assertFragments(
      bundle,
      [
        'focusDirection(q,K){if(!this.enabled)return!1',
        'if(!this.activeElement)return this.moveFocus(1,K),!0',
        'if(z)return this.focus(z),!0;return!1',
        'hyperlinkUrl;defaultAllowed=!1;allowDefault(){this.defaultAllowed=!0}',
        'let O=new Ia6(K,_,z,Y),w=!1',
        'O.defaultAllowed=!1,$(O)',
        'O.didStopImmediatePropagation())return!O.defaultAllowed',
        'if(!O.defaultAllowed)w=!0',
        'activeElement:_',
        'subscribe:q?.subscribe??B_4',
      ],
      'target108',
    )
    if (baselineBundlePath) {
      const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
      assert.equal(baseline.includes('defaultAllowed'), false)
      assert.equal(baseline.includes('focusDirection'), false)
    }
  },
)

test(
  'latest target preserves the evolved return-valued focus hook and click defaults',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !latestBundlePath
        ? 'CLAUDE_CODE_2_1_116_BUNDLE is required'
        : false,
  },
  () => {
    const bytes = fs.readFileSync(latestBundlePath)
    assert.equal(
      sha256(bytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const bundle = bytes.toString('utf8')
    assertFragments(
      bundle,
      [
        'defaultAllowed=!1;allowDefault(){this.defaultAllowed=!0}',
        '.defaultAllowed=!1',
        'return H.focusDirection(K,$);return!1',
        'activeElement:q',
        'subscribe:H?.subscribe??B4K',
      ],
      'target116',
    )
  },
)

test(
  'source connects geometry, focus subscriptions, click bubbling, and hyperlink fallback',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const focus = compact(source('ink/focus.ts'))
    const click = compact(source('ink/events/click-event.ts'))
    const hitTest = compact(source('ink/hit-test.ts'))
    const useFocus = compact(source('ink/hooks/use-focus.ts'))
    const ink = compact(source('ink/ink.tsx'))
    const app = compact(source('ink/components/App.tsx'))
    const publicApi = compact(source('ink.ts'))

    assertFragments(
      focus,
      [
        "export type FocusDirection = 'left' | 'right' | 'up' | 'down'",
        'subscribe = (listener: () => void)',
        'this.dispatchFocusEvent(node, new FocusEvent(\'focus\', previous))',
        'this.notify()',
        'focusDirection(direction: FocusDirection, root: DOMElement): boolean',
        'if (!this.enabled) return false',
        'this.moveFocus(1, root) return true',
        'for (const candidate of collectTabbable(root))',
        'if (candidate === this.activeElement) continue',
        'const score = directionalScore(currentRect, candidateRect, direction)',
        'if (!closest) return false',
        'this.focus(closest) return true',
        'if (primaryDistance <= 0) return Infinity',
      ],
      'ink/focus.ts',
    )
    assertFragments(
      click,
      [
        'readonly hyperlinkUrl: string | undefined',
        'defaultAllowed = false',
        'allowDefault(): void',
        'this.defaultAllowed = true',
        'this.hyperlinkUrl = hyperlinkUrl',
      ],
      'click-event.ts',
    )
    assertFragments(
      hitTest,
      [
        'hyperlinkUrl?: string',
        "typeof focusTarget.attributes['tabIndex'] === 'number'",
        'root.focusManager.handleClickFocus(focusTarget)',
        'new ClickEvent(col, row, cellIsBlank, hyperlinkUrl)',
        'event.localCol = col - rect.x',
        'event.localRow = row - rect.y',
        'event.defaultAllowed = false handler(event)',
        'if (event.didStopImmediatePropagation()) return !event.defaultAllowed',
        'if (!event.defaultAllowed) handled = true',
        'return handled',
      ],
      'hit-test.ts',
    )
    assertFragments(
      useFocus,
      [
        'useSyncExternalStore(',
        'focusManager?.subscribe ?? noopSubscribe',
        'activeElement,',
        'focusDirection: (direction: FocusDirection)',
        'focus: (node: DOMElement) => focusManager?.focus(node)',
        'blur: () => focusManager?.blur()',
        'subscribe: focusManager?.subscribe ?? noopSubscribe',
      ],
      'use-focus.ts',
    )
    if (historical) {
      assert.ok(
        useFocus.includes(
          'if (focusManager && rootNode) focusManager.focusDirection(direction, rootNode)',
        ),
      )
      assert.equal(
        useFocus.includes('return focusManager.focusDirection(direction, rootNode)'),
        false,
      )
    } else {
      assert.ok(
        useFocus.includes('return focusManager.focusDirection(direction, rootNode)'),
      )
      assert.ok(useFocus.includes('return false'))
    }
    assertFragments(
      ink,
      [
        'if (!this.altScreenActive) return false',
        'const blank = isEmptyCellAt(this.frontFrame.screen, col, row)',
        'const hyperlink = this.getHyperlinkAt(col, row)',
        'return dispatchClick(this.rootNode, col, row, blank, hyperlink)',
      ],
      'ink.tsx',
    )
    const dispatch = app.indexOf('if (!app.props.onClickAt(col, row))')
    const lookup = app.indexOf('app.props.getHyperlinkAt(col, row)', dispatch)
    const open = app.indexOf('app.props.onOpenHyperlink(url)', lookup)
    assert.ok(dispatch !== -1 && dispatch < lookup && lookup < open)
    assert.ok(publicApi.includes("export { default as useFocus } from './ink/hooks/use-focus.js'"))
    assert.ok(publicApi.includes("export { ClickEvent } from './ink/events/click-event.js'"))
  },
)

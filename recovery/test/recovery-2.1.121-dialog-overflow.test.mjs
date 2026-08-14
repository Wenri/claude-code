import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const artifacts = {
  baseline: {
    env: 'CLAUDE_CODE_2_1_120_BUNDLE',
    bytes: 13_784_743,
    sha256: 'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f',
  },
  target: {
    env: 'CLAUDE_CODE_2_1_121_BUNDLE',
    bytes: 13_908_188,
    sha256: '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
}

function readArtifact(spec) {
  const filename = process.env[spec.env]
  assert.ok(filename, `${spec.env} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, spec.bytes)
  assert.equal(crypto.createHash('sha256').update(value).digest('hex'), spec.sha256)
  return value.toString('utf8')
}

function count(value, fragment) {
  let result = 0
  let offset = 0
  while ((offset = value.indexOf(fragment, offset)) !== -1) {
    result++
    offset += fragment.length
  }
  return result
}

test('2.1.121 adds a bounded, claimable modal scroll owner', () => {
  const baseline = readArtifact(artifacts.baseline)
  const target = readArtifact(artifacts.target)
  for (const [fragment, baselineCount, targetCount] of [
    ['claimScrollBox', 0, 5],
    ['getFreshScrollHeight(),$H=r.getViewportHeight()||w', 0, 1],
    ['function O85(H)', 0, 1],
    ['scrollRef:z,maxRows:G', 0, 1],
  ]) {
    assert.equal(count(baseline, fragment), baselineCount, fragment)
    assert.equal(count(target, fragment), targetCount, fragment)
  }

  const context = fs.readFileSync(
    path.join(repo, 'src/context/modalContext.tsx'),
    'utf8',
  )
  const layout = fs.readFileSync(
    path.join(repo, 'src/components/FullscreenLayout.tsx'),
    'utf8',
  )
  const tabs = fs.readFileSync(
    path.join(repo, 'src/components/design-system/Tabs.tsx'),
    'utf8',
  )
  const repl = fs.readFileSync(path.join(repo, 'src/screens/REPL.tsx'), 'utf8')
  assert.match(context, /claimScrollBox:/)
  assert.match(layout, /function ModalScroller/)
  assert.match(layout, /getFreshScrollHeight\(\)/)
  assert.match(layout, /setInterval\(\(\) =>/)
  assert.match(tabs, /claimScrollBox\(headerRows\)/)
  assert.match(tabs, /maxHeight=\{modalBodyRows\}/)
  assert.match(repl, /centeredModal != null \? modalScrollRef : scrollRef/)
})

test('retained directional focus architecture is restored in source', () => {
  const baseline = readArtifact(artifacts.baseline)
  const target = readArtifact(artifacts.target)
  for (const fragment of [
    'focusDirection(H,$)',
    'focusManager:this.props.focusManager,rootNode:this.props.rootNode',
  ]) {
    assert.equal(count(baseline, fragment), 1, fragment)
    assert.equal(count(target, fragment), 1, fragment)
  }

  const focus = fs.readFileSync(path.join(repo, 'src/ink/focus.ts'), 'utf8')
  const app = fs.readFileSync(
    path.join(repo, 'src/ink/components/App.tsx'),
    'utf8',
  )
  const hook = fs.readFileSync(
    path.join(repo, 'src/ink/hooks/use-focus.ts'),
    'utf8',
  )
  assert.match(focus, /focusDirection\(direction: FocusDirection/)
  assert.match(focus, /directionalScore/)
  assert.match(app, /focusManager: this\.props\.focusManager/)
  assert.match(app, /rootNode: this\.props\.rootNode/)
  assert.match(hook, /useSyncExternalStore/)
})

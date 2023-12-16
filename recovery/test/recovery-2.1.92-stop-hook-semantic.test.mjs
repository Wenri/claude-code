import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.91-to-2.1.92'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historical = semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_91_BUNDLE
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
  [15053, [11130830, 11133656, 'e22be254e5fb1623a1efb97faa24571408427a154e7b810c99d8def881ec2bf9']],
  [15054, [11133656, 11133708, '9ac95cab996de91cee8b0f3afdb41b71ffb157cb4d2beb706f6a15ea0968bfbb']],
  [15056, [11133715, 11133786, 'd4018cffeba80b2e5dee073130d94dc9e7c8255ceb2c76348d7c566882cc3e76']],
  [15058, [11133797, 11133820, '364ae107fd0f033f64cc980f2c453ea664516e2157ad3c68c0a9736e86410d62']],
  [15059, [11133820, 11133985, 'bbca038a024935dc7d221a4ff092ebf925519ac360dd2c684eb5efa5cf374555']],
  [15060, [11133985, 11134751, '06f5fcf0ad96dbcd9d9ed624e34643a06c40e78d7b6a668769cd03b930652b2f']],
  [15061, [11134751, 11134804, '378c78403579b679b581ef4181d01f3d7e8e69690cda310edbc957b00508be75']],
  [15063, [11134816, 11135025, 'bc9a626052501392d2c2e24f6ba5a5e28998ef0312739b86933500943a103179']],
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

test(
  'target92 authenticates every newly reachable Stop-hook unit',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetBundlePath
        ? 'CLAUDE_CODE_2_1_92_BUNDLE is required'
        : false,
  },
  () => {
    const bytes = fs.readFileSync(targetBundlePath)
    assert.equal(
      sha256(bytes),
      '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362',
    )
    const bundle = bytes.toString('utf8')
    for (const [index, identity] of targetUnits) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: classification`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        identity,
        `${index}: structural identity`,
      )
      assert.equal(
        sha256(bundle.slice(identity[0], identity[1])),
        identity[2],
        `${index}: target bytes`,
      )
    }
    for (const fragment of [
      'title:"Set Stop hook (this session only)"',
      'placeholder:"e.g. Has Claude completed all requested tasks?"',
      'if(z6.key==="tab"){z6.preventDefault(),X(zSY);return}',
      'if(M==="delete"&&z6.key==="return")z6.preventDefault(),V()',
      'let z=K.setAppStateForTasks??K.setAppState',
      'if(A===H){q("Stop hook unchanged"',
      'wE6(z,Y,"Stop","",{type:"prompt",prompt:H})',
      'name:"stop-hook",description:"Set a session-only Stop hook with a quick prompt"',
    ]) {
      assert.ok(bundle.includes(fragment), fragment)
    }
    if (baselineBundlePath) {
      const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
      assert.equal(baseline.includes('Set Stop hook (this session only)'), false)
      assert.equal(baseline.includes('tengu_stop_hook_command'), false)
    }
  },
)

test(
  'latest target preserves the evolved registry-backed Stop-hook graph',
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
    for (const fragment of [
      'title:"Set Stop hook (this session only)"',
      'action:"switch focus"',
      'let{sessionHooksRegistry:K}=$',
      'K.remove(_,"Stop",D)',
      'K.add(_,"Stop","",{type:"prompt",prompt:M})',
      'Q("tengu_stop_hook_added",{promptLength:M.length})',
      'name:"stop-hook",description:"Set a session-only Stop hook with a quick prompt"',
    ]) {
      assert.ok(bundle.includes(fragment), fragment)
    }
  },
)

test(
  'source owns dialog focus, mutation branches, telemetry, and registration',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const dialog = compact(source('commands/stop-hook/StopHookDialog.tsx'))
    const command = compact(source('commands/stop-hook/stop-hook.tsx'))
    const descriptor = compact(source('commands/stop-hook/index.ts'))
    const commands = compact(source('commands.ts'))

    for (const fragment of [
      'title="Set Stop hook (this session only)"',
      'const trimmedPrompt = prompt.trim()',
      "if (promptIsEmpty && !deletingFromInput) return",
      "if (event.key === 'tab')",
      'setFocusedField(toggleFocusedField)',
      "if (focusedField === 'delete' && event.key === 'return')",
      "onSubmit('')",
      'focus={inputFocused}',
      'showCursor={inputFocused}',
      'disableEscapeDoublePress',
    ]) {
      assert.ok(dialog.includes(fragment), fragment)
    }
    for (const fragment of [
      "logEvent('tengu_stop_hook_command', {})",
      "getSessionHooks(appState, sessionId, 'Stop').get('Stop')",
      "if (matcher.matcher !== '') continue",
      "if (hook.type === 'prompt') prompts.push(hook)",
      "args.trim() || existingPrompt || ''",
      "'Stop hook cleared' : 'Cancelled'",
      "logEvent('tengu_stop_hook_removed', {})",
      "onDone('Stop hook unchanged'",
      "logEvent('tengu_stop_hook_added', { promptLength: prompt.length })",
      "'Stop hook set' : 'Stop hook updated'",
    ]) {
      assert.ok(command.includes(fragment), fragment)
    }
    if (historical) {
      assert.ok(command.includes('context.setAppStateForTasks ?? context.setAppState'))
      assert.ok(command.includes('removeSessionHook(setAppState'))
      assert.ok(command.includes('addSessionHook(setAppState'))
    } else {
      assert.ok(command.includes('context.sessionHooksRegistry!'))
      assert.ok(command.includes("registry.remove(sessionId, 'Stop', hook)"))
      assert.ok(command.includes("registry.add(sessionId, 'Stop', '', { type: 'prompt', prompt })"))
      assert.ok(dialog.includes('action="switch focus"'))
    }
    assert.ok(descriptor.includes("name: 'stop-hook'"))
    assert.ok(descriptor.includes('immediate: true'))
    assert.ok(descriptor.includes('isEnabled: () => false'))
    assert.ok(commands.includes("import stopHook from './commands/stop-hook/index.js'"))
    assert.ok(commands.includes('hooks, stopHook,'))
  },
)

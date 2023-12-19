import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

test(
  'target110 authenticates monitor push guidance and housekeeping suppression',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.109 and 2.1.110 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7',
    )
    assert.equal(
      sha256(targetBytes),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    const target = targetBytes.toString('utf8')
    const identities = new Map([
      [
        8913,
        [
          5945084,
          5945334,
          'FunctionDeclaration',
          '9b9bbe3bb742d55ca9c3f4063ea343c6da2a50348466a22b927346d9701bfd54',
        ],
      ],
      [
        8921,
        [
          5949760,
          5950202,
          'FunctionDeclaration',
          '1aff8d611318cbf86529f06ef65e61d0f64be5044a6cba2f9be2d53bdda9277d',
        ],
      ],
      [
        12181,
        [
          9196412,
          9196770,
          'FunctionDeclaration',
          'c4fcec7c21e385acbcc3426267172f57cea32163895483d034ebd1ade3bd24a5',
        ],
      ],
      [
        18994,
        [
          12879508,
          12879733,
          'FunctionDeclaration',
          'e7ff1864d4f661a56df72ea69af16406c27432f3fe49a8a980767bb2f195ff5f',
        ],
      ],
    ])
    const units = new Map()
    for (const [index, identity] of identities) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        identity,
        `${index}: identity`,
      )
      const unit = target.slice(region.target.start, region.target.end)
      assert.equal(sha256(unit), region.target.sourceHash, `${index}: bytes`)
      units.set(index, unit)
    }
    const unit = units.get(12181)
    for (const fragment of [
      'isHousekeeping',
      'If this event is something the user would act on now, send a ',
      ". Routine or benign output doesn't need one.",
      'mode:"task-notification",priority:"next"',
    ]) {
      assert.ok(unit.includes(fragment), fragment)
    }
    assert.match(
      units.get(8913),
      /When an event lands that the user would want to act on now/,
    )
    assert.match(
      units.get(8913),
      /Not every event is worth a push; the ones that change what they'd do next are\./,
    )
    assert.match(
      units.get(8921),
      /Use \$\{[^}]+\} when the loop can't move further without the user/,
    )
    assert.match(units.get(8921), /One ping per state, not per tick\./)
    assert.match(
      units.get(18994),
      /Before you stop, send a one-line outcome via /,
    )
    assert.match(units.get(18994), /via \$\{[^}]+\} — the user may be away/)
    assert.equal(
      baselineBytes
        .toString('utf8')
        .includes('If this event is something the user would act on now'),
      false,
    )
  },
)

test(
  'source gates push guidance and preserves the target-version envelope',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const owner = fs.readFileSync(
      path.join(sourceRoot, 'tools/MonitorTool/MonitorTool.ts'),
      'utf8',
    )
    for (const fragment of [
      'isLoopPushNotificationEnabled',
      'PUSH_NOTIFICATION_TOOL_NAME',
      'function getMonitorPrompt(): string',
      'When an event lands that the user would want to act on now',
      "Not every event is worth a push; the ones that change what they'd do next are.",
      'return getMonitorPrompt()',
      'options?: { isHousekeeping?: boolean',
      '!options?.isHousekeeping && isLoopPushNotificationEnabled()',
      'If this event is something the user would act on now, send a ${PUSH_NOTIFICATION_TOOL_NAME}. Routine or benign output doesn\'t need one.',
      "mode: 'task-notification'",
      "priority: 'next'",
    ]) {
      assert.ok(owner.includes(fragment), fragment)
    }
    const loopOwner = fs.readFileSync(
      path.join(sourceRoot, 'utils/loopSentinels.ts'),
      'utf8',
    )
    for (const fragment of [
      'function pushNotificationGuidance(): string',
      "Use PushNotification when the loop can't move further without the user",
      'One ping per state, not per tick.',
      '${pushNotificationGuidance()}',
    ]) {
      assert.ok(loopOwner.includes(fragment), fragment)
    }
    const loopSkill = fs.readFileSync(
      path.join(sourceRoot, 'skills/bundled/loop.ts'),
      'utf8',
    )
    for (const fragment of [
      'function pushCompletionGuidance(): string',
      'Before you stop, send a one-line outcome via PushNotification',
      "user may be away and waiting to hear it\\'s done",
      '${pushCompletionGuidance()}',
    ]) {
      assert.ok(loopSkill.includes(fragment), fragment)
    }
    if (semanticCase === caseName) {
      assert.ok(owner.includes('</task-notification>${pushGuidance}`'))
      assert.equal(owner.includes('agentId: options?.agentId'), false)
    } else {
      assert.ok(owner.includes('<event>${escapeXml(event)}</event>${pushGuidance}'))
      assert.ok(owner.includes('agentId: options?.agentId'))
    }
  },
)

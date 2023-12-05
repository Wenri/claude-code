import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const generalSourcePath = fileURLToPath(
  new URL('../../src/components/HelpV2/General.tsx', import.meta.url),
)
const targetBundlePath = process.env.CLAUDE_CODE_2_1_90_BUNDLE
const targetFragment = {
  start: 'function zyK(){let q=Y6(6),{rows:K}=e1(),_;',
  end: 'var QM,BXY=44;',
  bytes: 867,
  sha256:
    '7603d7e4b28ffded85c73612bbd521296fa3c14cd9979bbe19813b85f0beb2ba',
}

test('shows the recovered powerup hint at 44 terminal rows', () => {
  const source = fs.readFileSync(generalSourcePath, 'utf8')
  const executableSource = source.slice(0, source.indexOf('//# sourceMappingURL='))

  assert.match(
    executableSource,
    /import \{ useTerminalSize \} from '\.\.\/\.\.\/hooks\/useTerminalSize\.js';/,
  )
  assert.match(executableSource, /const MIN_ROWS_FOR_POWERUP_HINT = 44;/)
  assert.match(executableSource, /const \$ = _c\(6\);/)
  assert.match(executableSource, /if \(\$\[1\] !== rows\)/)
  assert.match(
    executableSource,
    /t1 = rows >= MIN_ROWS_FOR_POWERUP_HINT && <Box><Text dimColor=\{true\}>/,
  )
  assert.match(executableSource, /\$\[4\] !== t1/)

  const hint = executableSource.match(
    /t1 = rows >= MIN_ROWS_FOR_POWERUP_HINT && (.+);/,
  )
  assert.ok(hint)
  assert.equal(
    hint[1].replace(/<[^>]+>/g, ''),
    'New here? Run /powerup to learn the features most people miss.',
  )
})

test(
  'links the HelpV2 recovery to the exact 2.1.90 target function',
  { skip: !targetBundlePath },
  () => {
    const bundle = fs.readFileSync(targetBundlePath, 'utf8')
    assert.equal(bundle.split(targetFragment.start).length - 1, 1)
    assert.equal(bundle.split(targetFragment.end).length - 1, 1)

    const start = bundle.indexOf(targetFragment.start)
    const end = bundle.indexOf(targetFragment.end, start)
    const fragment = bundle.slice(start, end)

    assert.equal(Buffer.byteLength(fragment), targetFragment.bytes)
    assert.equal(
      crypto.createHash('sha256').update(fragment).digest('hex'),
      targetFragment.sha256,
    )
  },
)

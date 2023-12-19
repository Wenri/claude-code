import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = {
  baseline: {
    names: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  target: {
    names: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
}

function loadBundle({ names, bytes, sha256 }) {
  const filename = names.map(name => process.env[name]).find(Boolean)
  assert.ok(filename, `${names.join(' or ')} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, bytes)
  assert.equal(crypto.createHash('sha256').update(value).digest('hex'), sha256)
  return value.toString('utf8')
}

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function compact(value) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

function count(value, fragment) {
  return value.split(fragment).length - 1
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function providerNameBefore(bundle, fragment) {
  const index = bundle.indexOf(fragment)
  assert.ok(index >= 0, `missing provider fragment: ${fragment}`)
  const prefix = bundle.slice(Math.max(0, index - 600), index)
  const definitions = [...prefix.matchAll(/function ([A-Za-z_$][\w$]*)\(/g)]
  const name = definitions.at(-1)?.[1]
  assert.ok(name, `missing provider definition before: ${fragment}`)
  return name
}

test('authenticated adjacent releases retain both per-App stores and lifecycle', () => {
  for (const [name, release] of Object.entries(releases)) {
    const bundle = loadBundle(release)
    assert.equal(
      count(bundle, 'currentTimeoutId:{current:null},mountCount:{current:0}'),
      2,
      `${name}: provider and hook fallback lifecycle stores`,
    )
    assert.equal(count(bundle, 'currentTimeoutId'), 3, `${name}: timeout ref keys`)
    assert.equal(count(bundle, 'mountCount'), 3, `${name}: mount-count ref keys`)
    assert.equal(count(bundle, 'getDenials'), 5, `${name}: denial getter cardinality`)
    assert.equal(count(bundle, 'recordDenial'), 3, `${name}: denial recorder cardinality`)
    assert.equal(count(bundle, 'removeDenial'), 3, `${name}: denial remover cardinality`)
    assert.equal(
      count(
        bundle,
        'getDenials:()=>[],recordDenial:()=>{},removeDenial:()=>{}',
      ),
      1,
      `${name}: provider-free denial fallback`,
    )

    assert.match(
      bundle,
      /\.useEffect\(\(\)=>\{if\(([\w$]+)\.current\+\+,[\w$]+\.getState\(\)\.notifications\.queue\.length>0\)[\w$]+\(\);return\(\)=>\{if\(\1\.current--,\1\.current===0&&([\w$]+)\.current\)clearTimeout\(\2\.current\),\2\.current=null\}\},\[\]\)/,
      `${name}: shared timeout survives sibling hooks and clears after the last unmount`,
    )
    assert.match(
      bundle,
      /getDenials:\(\)=>[\w$]+\.current,recordDenial:\([\w$]+\)=>\{[\w$]+\.current=\[[\w$]+,\.\.\.[\w$]+\.current\.slice\(0,[\w$]+-1\)\]\},removeDenial:\([\w$]+\)=>\{[\w$]+\.current=[\w$]+\.current\.filter\(\([\w$]+\)=>[\w$]+!==[\w$]+\)\}/,
      `${name}: denial store prepends, caps, and removes by identity`,
    )

    const notificationProvider = providerNameBefore(
      bundle,
      'currentTimeoutId:{current:null},mountCount:{current:0}',
    )
    const recentDenialsProvider = providerNameBefore(bundle, 'getDenials:()=>')
    assert.match(
      bundle,
      new RegExp(
        `createElement\\(${escapeRegExp(notificationProvider)},null,[\\s\\S]{0,100}` +
          `createElement\\(${escapeRegExp(recentDenialsProvider)},null,[\\s\\S]{0,100}` +
          'createElement\\([\\w$]+,null,[\\s\\S]{0,100}' +
          'createElement\\([\\w$]+,null,[\\w$]+\\)',
      ),
      `${name}: NotificationLifecycle -> RecentDenials -> KillRing -> SelectionDelete`,
    )
  }
})

test('source restores isolated stores, exact consumers, and provider order', () => {
  const notifications = compact(source('src/context/notifications.tsx'))
  const denials = compact(source('src/context/recentDenials.tsx'))
  const app = compact(source('src/components/App.tsx'))
  const canUseTool = compact(source('src/hooks/useCanUseTool.tsx'))
  const recentTab = compact(
    source('src/components/permissions/rules/RecentDenialsTab.tsx'),
  )
  const rules = compact(
    source('src/components/permissions/rules/PermissionRuleList.tsx'),
  )

  assert.ok(notifications.includes('export function NotificationLifecycleProvider'))
  assert.equal(count(notifications, 'currentTimeoutId: { current: null }'), 2)
  assert.equal(count(notifications, 'mountCount: { current: 0 }'), 2)
  assert.ok(notifications.includes('mountCount.current++'))
  assert.ok(notifications.includes('mountCount.current--'))
  assert.ok(
    notifications.includes(
      'mountCount.current === 0 && currentTimeoutId.current',
    ),
  )
  assert.doesNotMatch(notifications, /let currentTimeoutId/)

  for (const witness of [
    'const MAX_RECENT_DENIALS = 20',
    'getDenials: () => denialsRef.current',
    'denialsRef.current.slice(0, MAX_RECENT_DENIALS - 1)',
    'candidate => candidate !== denial',
    'export function RecentDenialsProvider',
    'export function useRecentDenials',
  ]) {
    assert.ok(denials.includes(witness), witness)
  }
  assert.equal(
    fs.existsSync(path.join(repo, 'src/utils/autoModeDenials.ts')),
    false,
    'module-global denial store is removed',
  )

  assert.ok(
    app.includes(
      '<AppStateProvider initialState={initialState} onChangeAppState={onChangeAppState}>{t1}</AppStateProvider>',
    ),
  )
  assert.ok(
    app.includes(
      '<NotificationLifecycleProvider><RecentDenialsProvider><KillRingProvider><SelectionDeleteProvider>{children}</SelectionDeleteProvider></KillRingProvider></RecentDenialsProvider></NotificationLifecycleProvider>',
    ),
  )
  assert.ok(canUseTool.includes('recordDenial, getDenials, removeDenial'))
  assert.ok(canUseTool.includes('const previousDenial = getDenials().find('))
  assert.ok(canUseTool.includes('recordDenial({'))
  assert.ok(canUseTool.includes('removeDenial(previousDenial)'))
  assert.ok(recentTab.includes('const [denials] = useState(getDenials)'))
  assert.ok(rules.includes('const t1 = useMemo(getDenials, [getDenials])'))
})

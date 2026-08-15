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

test('authenticates retained daemon hub controls and assistant hard-DCE', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.match(
      bundle,
      /function \w+\(H\)\{if\(!H\.serviceSupported\|\|!H\.serviceInstalled\)return\[\];if\(H\.lock===null\)return\["uninstall"\];return\["stop","uninstall"\]\}/,
      `${release.version}: exact service actions`,
    )
    assert.equal(
      bundle.split('not installed (runs on demand)').length - 1,
      1,
      `${release.version}: on-demand status copy`,
    )
    const statusAnchor = bundle.indexOf('not installed (runs on demand)')
    const status = bundle.slice(statusAnchor - 300, statusAnchor + 2_500)
    assert.match(
      status,
      /\.status===null\|\|[^;]+\.version!==/,
      `${release.version}: unknown status requires update warning`,
    )
    assert.match(status, /restart to update/)
    assert.match(
      bundle,
      /\{uninstall:"Uninstall service",stop:"Stop"\}/,
      `${release.version}: exact service labels`,
    )
    assert.match(
      bundle,
      /\.type!=="hub"\)return;let \w+=0,\w+=setInterval\(\(\w+,\w+\)=>\{if\(\w+\(Date\.now\(\)\),\w+\+\+%2===0\)\w+\(\)\},1000,/,
      `${release.version}: one-second clock and first-tick refresh`,
    )
    assert.match(
      bundle,
      /finally\{try\{await \w+\(\)\}catch\{\}\w+\(!1\)\}/,
      `${release.version}: service refresh is fail-soft`,
    )
    assert.equal(bundle.split('Restart ${').length - 1, 1, release.version)
    assert.match(
      bundle,
      /\[\{label:`Restart \$\{\w+\(\)\}`,value:"restart"\},\{label:"Remove",value:"remove"\},\{label:"Back",value:"back"\}\]/,
      `${release.version}: dynamic remote-control restart label`,
    )

    // The assistant detail and installer are retained in the bundle, but the
    // loader supplies no assistant rows and the tab list has no assistant tab.
    assert.equal(bundle.split('Clear conversation history?').length - 1, 1)
    assert.equal(bundle.split('detail-assistant').length - 1, 1)
    assert.equal(bundle.split('key:"assistant"').length - 1, 0)
    assert.match(
      bundle,
      /Promise\.resolve\(\[\]\)[\s\S]{0,1000}assistants:\w+,servers:/,
      `${release.version}: assistants are a literal empty loader result`,
    )
  }
})

test('source exposes only target-active service actions and exact status behavior', () => {
  const source = fs.readFileSync(path.join(repo, 'src/daemon/hub.tsx'), 'utf8')

  assert.match(source, /type ServiceAction = 'uninstall' \| 'stop'/)
  assert.match(
    source,
    /if \(!data\.serviceSupported \|\| !data\.serviceInstalled\) return \[\][\s\S]*if \(!data\.lock\) return \['uninstall'\][\s\S]*return \['stop', 'uninstall'\]/,
  )
  assert.doesNotMatch(source, /\binstallDaemonService|Install service|\['start'/)
  assert.match(source, /'not installed \(runs on demand\)'/)
  assert.match(
    source,
    /data\.status === null \|\| data\.lock\.version !== MACRO\.VERSION/,
  )
  assert.match(source, /await controlDaemonService\('stop'\)/)
  assert.match(source, /const \[now, setNow\] = useState\(\(\) => Date\.now\(\)\)/)
  assert.match(source, /setNow\(Date\.now\(\)\)[\s\S]*ticks\+\+ % 2 === 0/)
  assert.match(source, /finally \{[\s\S]*try \{[\s\S]*await refresh\(\)[\s\S]*\} catch \{\}/)
  assert.match(source, /`Restart \$\{bgSupervisorNoun\(\)\}`/)
  assert.match(source, /truncateStartToWidth\(server\.dir, 40\)/)
  assert.match(
    source,
    /StatusIcon status=\{task\.enabled \? 'success' : 'pending'\} withSpace/,
  )
  assert.match(
    source,
    /StatusIcon status=\{isRunning \? 'success' : 'pending'\} withSpace/,
  )

  assert.match(source, /type HubTab = 'scheduled' \| 'remoteControl'/)
  assert.match(source, /Promise\.resolve\(\[\] as AssistantConfig\[\]\)/)
  assert.doesNotMatch(source, /type: 'assistant-detail'/)
})

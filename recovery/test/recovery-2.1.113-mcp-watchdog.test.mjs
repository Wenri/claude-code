import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

function source(relative) {
  return fs.readFileSync(
    fileURLToPath(new URL(`../../${relative}`, import.meta.url)),
    'utf8',
  )
}

test('tracks transport-loss timeouts independently for concurrent MCP calls', () => {
  const types = source('src/services/mcp/types.ts')
  assert.match(
    types,
    /activeCallWatchdogs: Set<\{ armedAt: number \}>/,
  )
  assert.doesNotMatch(types, /lastErrorAt/)

  const client = source('src/services/mcp/client.ts')
  assert.match(
    client,
    /activeCallWatchdogs: new Set<\{ armedAt: number \}>\(\)/,
  )
  assert.match(
    client,
    /for \(const watchdog of transportErrorState\.activeCallWatchdogs\) \{\s+if \(watchdog\.armedAt === 0\) watchdog\.armedAt = now/,
  )
  assert.equal(client.match(/armActiveCallWatchdogs\(\)/g)?.length, 2)
  assert.match(
    client,
    /transportErrorState\?\.activeCallWatchdogs\.add\(transportErrorWatchdog\)/,
  )
  assert.match(
    client,
    /transportErrorWatchdog\.armedAt > 0 &&\s+Date\.now\(\) - transportErrorWatchdog\.armedAt > 90000/,
  )
  assert.match(
    client,
    /onprogress: sdkProgress => \{\s+transportErrorWatchdog\.armedAt = 0/,
  )
  assert.equal(
    client.match(
      /activeCallWatchdogs\.delete\(transportErrorWatchdog\)/g,
    )?.length,
    2,
  )
  assert.doesNotMatch(client, /lastErrorAt/)
})

test('generic MCP messages reset reconnection errors without disarming calls', () => {
  const client = source('src/services/mcp/client.ts')
  const handler = client.match(
    /client\.transport\.onmessage = \(message, extra\) => \{([\s\S]*?)originalOnmessage\?\.\(message, extra\)/,
  )
  assert.ok(handler)
  assert.match(handler[1], /transportErrorState\.consecutiveErrors = 0/)
  assert.doesNotMatch(handler[1], /armedAt|activeCallWatchdogs/)
})

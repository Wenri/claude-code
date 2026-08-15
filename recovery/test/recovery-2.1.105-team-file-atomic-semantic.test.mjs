import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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

const units = new Map([
  [10400, [8392907, 8393531, '8efdcbb5cbad837bc2104e37db25752548a5d454b15d23c92cadb07f9538f55a']],
  [10411, [8394358, 8394459, 'b58c09cabf20e6c27db939685316dbc9c64baf01b64bbb5763786e95cfe3cbde']],
  [10412, [8394459, 8394791, '178d84ea8e19ade48e01010ae3445e083d827af49062f0e273b1cbe0733a6c09']],
  [10413, [8394791, 8394996, '35eefc68f9014c2d765be62a79733762a9a72dc94d7b8c1b150ca58c39c6248d']],
  [10423, [8397350, 8397713, '0d1d1d6341143d9e2c815c67fd3ecf8881eacc20863af23b3e20f441663a6950']],
  [10431, [8399850, 8400510, '6bb1e9cba21e85595dd922d80d2ad20a230b5dc0a175d08d810b840034d27df2']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function functionSource(contents, name, prefix = 'function') {
  const start = contents.indexOf(`${prefix} ${name}`)
  assert.notEqual(start, -1, `${name}: declaration`)
  const body = contents.indexOf('{', start)
  let depth = 0
  for (let index = body; index < contents.length; index++) {
    if (contents[index] === '{') depth++
    else if (contents[index] === '}' && --depth === 0) {
      return contents.slice(start, index + 1)
    }
  }
  throw new Error(`${name}: unterminated`)
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

test(
  'target105 pins the complete atomic team-file update boundary',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.104 and 2.1.105 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    assert.equal(baseline.includes('updateTeamFile lock release failed'), false)
    assert.equal(target.includes('updateTeamFile lock release failed'), true)
    assert.equal(target.includes('removeTeamMember('), true)

    for (const [index, identity] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        identity,
        `${index}: identity`,
      )
      assert.equal(
        sha256(target.slice(identity[0], identity[1])),
        identity[2],
        `${index}: target bytes`,
      )
    }

    const graph = target.slice(8394358, 8400510)
    for (const fragment of [
      'lockfilePath:`${_}.lock`',
      'realpath:!1',
      'retries:{retries:10,minTimeout:5,maxTimeout:100}',
      'if(A===!1)return',
      'await z()',
      'members.splice(z,1)',
      'if(Y.isActive===_)return!1',
    ]) {
      assert.ok(graph.includes(fragment), fragment)
    }
  },
)

test(
  'authored updater serializes writes, suppresses no-ops, and always releases',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const owner = source('utils/swarm/teamHelpers.ts')
    for (const fragment of [
      "import { lock } from '../lockfile.js'",
      'const TEAM_FILE_LOCK_OPTIONS = {',
      'realpath: false,',
      'retries: { retries: 10, minTimeout: 5, maxTimeout: 100 },',
      'export async function updateTeamFile<T>(',
      'lockfilePath: `${teamFilePath}.lock`',
      'if (result === false) return',
      'await writeTeamFileAsync(teamName, teamFile)',
      'await release()',
      'export async function removeTeamMember(',
      'await updateTeamFile(teamName, teamFile => {',
      'if (member.isActive === isActive) return false',
    ]) {
      assert.ok(owner.includes(fragment), fragment)
    }

    const snippets = [
      functionSource(owner, 'teamDoesNotExistError'),
      functionSource(owner, 'updateTeamFile', 'export async function'),
      functionSource(owner, 'removeTeamMember', 'export async function'),
      functionSource(owner, 'setMemberActive', 'export async function'),
    ]
    const harness = `
      type TeamFile = { name: string; members: Array<{ agentId: string; name: string; isActive?: boolean }> };
      const TEAM_FILE_LOCK_OPTIONS = { realpath: false, retries: { retries: 10, minTimeout: 5, maxTimeout: 100 } };
      const __harness = {
        stored: null as TeamFile | null,
        writes: [] as TeamFile[],
        logs: [] as string[],
        locks: [] as Array<{ path: string; options: unknown }>,
        releases: 0,
        lockError: null as unknown,
        releaseError: null as unknown,
      };
      const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
      const getTeamFilePath = (name: string) => '/teams/' + name + '/config.json';
      const getErrnoCode = (error: any) => error?.code;
      const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
      const logForDebugging = (message: string) => { __harness.logs.push(message) };
      const lock = async (lockPath: string, options: unknown) => {
        __harness.locks.push({ path: lockPath, options });
        if (__harness.lockError) throw __harness.lockError;
        return async () => {
          __harness.releases++;
          if (__harness.releaseError) throw __harness.releaseError;
        };
      };
      const readTeamFileAsync = async (_name: string) =>
        __harness.stored ? clone(__harness.stored) : null;
      const writeTeamFileAsync = async (_name: string, value: TeamFile) => {
        __harness.stored = clone(value);
        __harness.writes.push(clone(value));
      };
    `
    const ts = await loadTypeScript()
    const javascript = ts.transpileModule(
      `${harness}\n${snippets.join('\n')}\nexport { __harness };`,
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText
    const module = { exports: {} }
    new Function('exports', 'module', javascript)(module.exports, module)
    const api = module.exports
    const state = api.__harness
    state.stored = {
      name: 'alpha',
      members: [
        { agentId: 'one-id', name: 'one', isActive: false },
        { agentId: 'two-id', name: 'two', isActive: true },
      ],
    }

    const result = await api.updateTeamFile('alpha', teamFile => {
      teamFile.name = 'updated'
      return 'written'
    })
    assert.equal(result, 'written')
    assert.equal(state.stored.name, 'updated')
    assert.equal(state.writes.length, 1)
    assert.equal(state.releases, 1)
    assert.deepEqual(state.locks[0], {
      path: '/teams/alpha/config.json',
      options: {
        lockfilePath: '/teams/alpha/config.json.lock',
        realpath: false,
        retries: { retries: 10, minTimeout: 5, maxTimeout: 100 },
      },
    })

    await api.updateTeamFile('alpha', () => false)
    assert.equal(state.writes.length, 1)
    assert.equal(state.releases, 2)
    await api.removeTeamMember('alpha', 'missing-id')
    assert.equal(state.writes.length, 1)
    await api.removeTeamMember('alpha', 'two-id')
    assert.deepEqual(
      state.stored.members.map(member => member.agentId),
      ['one-id'],
    )
    assert.equal(state.writes.length, 2)

    await api.setMemberActive('alpha', 'one', true)
    assert.equal(state.stored.members[0].isActive, true)
    assert.equal(state.writes.length, 3)
    await api.setMemberActive('alpha', 'one', true)
    await api.setMemberActive('alpha', 'missing', true)
    assert.equal(state.writes.length, 3)
    assert.ok(
      state.logs.some(message =>
        message.includes('Cannot set member active: member missing not found'),
      ),
    )

    state.releaseError = new Error('release exploded')
    await api.updateTeamFile('alpha', () => false)
    assert.ok(
      state.logs.includes(
        '[TeammateTool] updateTeamFile lock release failed: release exploded',
      ),
    )
    state.releaseError = null
    state.stored = null
    await assert.rejects(
      api.updateTeamFile('gone', () => true),
      /Team "gone" does not exist\. Call spawnTeam first to create the team\./,
    )

    const releasesBeforeLockFailure = state.releases
    state.lockError = Object.assign(new Error('missing'), { code: 'ENOENT' })
    await assert.rejects(
      api.updateTeamFile('gone', () => true),
      /Team "gone" does not exist\. Call spawnTeam first to create the team\./,
    )
    assert.equal(state.releases, releasesBeforeLockFailure)
  },
)

test(
  'target116 preserves the same atomic team-file contract',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !latestPath
        ? 'authenticated 2.1.116 structural bundle is required'
        : false,
  },
  () => {
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const latest = latestBytes.toString('utf8')
    assert.equal((latest.match(/updateTeamFile lock release failed/g) ?? []).length, 1)
    assert.equal((latest.match(/removeTeamMember\(/g) ?? []).length, 1)
    const at = latest.indexOf('updateTeamFile lock release failed')
    const graph = latest.slice(at - 800, at + 1600)
    assert.match(graph, /lockfilePath:`\$\{.+\}\.lock`/)
    assert.match(latest, /realpath:!1,retries:\{retries:10,minTimeout:5,maxTimeout:100\}/)
    assert.match(graph, /\.members\.findIndex/)
  },
)

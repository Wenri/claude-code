import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const historical = sourceRoot !== path.join(repositoryRoot, 'src')
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
  [10208, [8295237, 8295519, '6b1401af335337811a29c2690165ce1fe2405f79968765d69acfc0ace83a0013']],
  [10985, [8633551, 8639601, '8a5655af861d072fcbb7a3e1e62bf34db1db312ad5b4a03df0170a6dd6f103a7']],
  [11172, [8725754, 8726436, '8000a4f9e1298985fd9b14aacafe0c1bc8dac9964bcf9cadc0b2be383d9d2cbe']],
  [11174, [8726535, 8727430, '0cc82eb5033fbf3e5ecb59bce6c69934820b46c2f6a95e667c6e8f0d70a4d25d']],
  [11175, [8727430, 8730564, '307f5017611c01eb778d4d30e5dc1868fc3f0837b975b662cc423f39d65af22b']],
  [11209, [8744666, 8747137, '4ea9191b95ae84df727bf1660a5e59a0f52ddda41ca42fd3f7738794c2b29505']],
  [11210, [8747137, 8749439, '3dff730c410566c7747139eca661822bf0fa0d8e3ff0082ff3830801fd9fba47']],
  [11234, [8767349, 8785018, '6258800f44ff50647a4e8a3dacd46c5e7e9cc97a0924833fca07bc323a5752c2']],
  [11578, [9139706, 9140293, '7bba7c2cacdf7e8be16dc547dd1a9336a978a100bb82e7ad66f8a11940e19a74']],
  [11587, [9140840, 9142652, '08bacec6c022e6d9695e912ba2dc8092683425bb3d1bdd7fa5f53413054e98dc']],
  [11636, [9155640, 9160182, 'a8c314f5b579997f727b684e9932da0a4b56ed7cfc5fc6479e1c2a36ecad1c55']],
  [11672, [9170849, 9176941, '062b0d42bb7c8b2b3181720b111ce7f365f2dff2e3f6c163a4d58e8b6eb5e847']],
  [11928, [9290774, 9292288, '3f59038d2065eeb2bad2c0d0d4927d9917b8dc994fd41c90eba9763bd9d79c1d']],
  [11955, [9306724, 9307872, '41720f10f9aefe43fe084bba41715c9e379880d10e7ff961dbf60f6bdf3015fd']],
  [11960, [9308382, 9311083, '4a66f8921951d39a1d80b9811bb9fbee9e67ec0a2d063aa31ba58d5f8aa10c49']],
  [11979, [9317469, 9322553, '9b6d64d1d41f31537c8bf740f09061e9b2cabad2c19bce980fb2f4fda3bd1e77']],
  [12253, [9480920, 9483989, '654dd2f4f03767e946cff870ba5472cd4ebe3b7e08f748c5e19c46549c8d7f93']],
  [12255, [9484232, 9491847, 'b5e226ffd9e2124c7d63e1d82c621441d321fd6b1aab099be027f1313d8d3b68']],
  [12410, [9540024, 9540893, '521bd16861aa387db47f913aa40686c6b95cc5fdf838ac67a5744e88a50873d6']],
  [12418, [9542586, 9543104, 'd27e6ca9453e042429b837ae94d3c0bc523b6b8bb248597497ad8556fb9f0a99']],
  [12419, [9543104, 9543898, 'e33fa5087604877ac928351ba3b5b889f1556f295854615228fc1df74011e5e3']],
  [12428, [9546114, 9546925, '50e500717ea3ff857d6191bc9cb43ddd8ff0a3d225ceae3018c0e1218f8dd604']],
  [12536, [9595047, 9597748, 'b210bfac002650dd876666f51185403ee641511750a1384f4644a662950b914d']],
  [12538, [9597834, 9608991, '20e8bf10e74544e3f067eccc5a1283363bf17458cd4e7d4a9d55744f1b8d1193']],
  [12727, [9721460, 9724624, 'c15cd2ee9b6f92cf22cf522aa58e956894816f2706f5ffb38ec8dae10f4eacc6']],
  [12775, [9756399, 9758729, 'd934dbc8a1bc35c74d516343fa06f757286f30bcc3389e5a51c82af4c5ed47a5']],
  [12961, [9856289, 9856448, '9933ac4dd158cf0044ddea2c502b07c67f7a39c4922d72a0852a1f08f9eb21c1']],
  [13015, [9875561, 9875889, '2961d3a28bfade5e2d390ba8000956d99e92ae51a5a4173e066d8ee76488eaff']],
  [13683, [10177522, 10181262, 'c192d8048545c455b6abbe1e9e1da544360ac181c6ff67c3c5eb26b1f6aceb6f']],
  [15103, [11175466, 11175597, '89ebd497afcf7f07aca552fd04242cfc86d603100972b540e5da504c0ed7af69']],
  [15106, [11175891, 11176742, 'f68c21d958ba105ee6a83c5e698f7d1e25c2b908743a28a89610307ef673e228']],
  [15247, [11221217, 11223120, '69c840c8533386c7e7261c2909e7c85856b06f0203764487db5ae09ba447f78d']],
  [17964, [12558139, 12558468, '928a4246020f1312d0277049e7e33142610684e083060ad3766109dbd7a60ee9']],
  [18386, [12731362, 12789746, 'a19619e44713e41b4e5b83d8f9e5e8a67ef9553396a241a74ccc40f4a7980e32']],
  [18926, [13408158, 13409774, 'ef3793de21fed8129e1f1da0e759edc1272a2478bfe58bae668543927b70c844']],
  [18934, [13410330, 13426994, '9c1d060ead7a059c35f7a2f11f846cedaa050565fe4fcc62e0d5a1f6651204c5']],
  [18967, [13439202, 13472373, 'dff9e4822e9aeb3d9473b61353ca117788616672af04a6c2c19428c0c2d67be1']],
])

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'authenticated 2.1.104 and 2.1.105 bundles are required'
      : false,
}
const latestOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !latestPath
      ? 'authenticated 2.1.116 structural bundle is required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertFragments(relative, fragments) {
  const contents = source(relative)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
  }
  return contents
}

// These owners were recovered at earlier introduction boundaries and are not
// duplicated wholesale in the target105 supplement merely to carry the narrow
// taskRegistry call-site migration.  An isolated own-supplement tree may
// therefore lack the cumulative owner (or retain the pre-recovery snapshot),
// while the current-source pass and a cumulatively materialized audit root must
// exercise the assertions below.
function assertCumulativeFragments(relative, fragments) {
  const filename = path.join(sourceRoot, relative)
  if (historical) {
    if (!fs.existsSync(filename)) return null
    const contents = fs.readFileSync(filename, 'utf8')
    if (!contents.includes(fragments[0])) return null
  }
  return assertFragments(relative, fragments)
}

function functionSource(contents, name) {
  const start = contents.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `${name}: declaration`)
  const body = contents.indexOf('{', start)
  let depth = 0
  for (let index = body; index < contents.length; index++) {
    if (contents[index] === '{') depth++
    if (contents[index] === '}' && --depth === 0) {
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

test('target105 pins the complete task-registry propagation boundary', pairOptions, () => {
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
  assert.equal((baseline.match(/taskRegistry/g) ?? []).length, 8)
  assert.equal((target.match(/taskRegistry/g) ?? []).length, 78)

  for (const [index, identity] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
      `${index}: identity`,
    )
    const statement = target.slice(identity[0], identity[1])
    assert.equal(sha256(statement), identity[2], `${index}: target bytes`)
    assert.equal(
      parse(statement, { ecmaVersion: 'latest', sourceType: 'module' }).body
        .length,
      1,
      `${index}: one statement`,
    )
  }

  for (const fragment of [
    'taskRegistry.register',
    'taskRegistry.update',
    'taskRegistry.get',
    'taskRegistry.all',
    'taskRegistry.applyOffsetsAndEvict',
  ]) {
    assert.ok(target.includes(fragment), fragment)
  }
})

test('source owns the registry abstraction and every reachable task family', sourceOptions, () => {
  assertFragments('utils/task/framework.ts', [
    'export type TaskRegistry = {',
    'export function createTaskRegistry(',
    'registerTask(task, setAppState)',
    'updateTaskState(taskId, setAppState, updater)',
    'const { [taskId]: _removed, ...tasks } = previous.tasks',
    'evictTerminalTask(taskId, setAppState)',
    'applyTaskOffsetsAndEvictions(',
    'return getAppState().tasks[taskId]',
    'return getAppState().tasks',
    'export const NOOP_TASK_REGISTRY: TaskRegistry',
  ])
  assertFragments('Task.ts', [
    'export type TaskContext = {',
    'taskRegistry: TaskRegistry',
    'taskRegistry: TaskRegistry,',
  ])
  assertFragments('Tool.ts', [
    'taskRegistry: TaskRegistry',
    'abortSpeculation?: () => void',
  ])
  assertFragments('hooks/useTaskRegistry.ts', [
    'export function useTaskRegistry(): TaskRegistry',
    'createTaskRegistry(store.getState, setAppState)',
  ])

  const remote = assertFragments('tasks/RemoteAgentTask/RemoteAgentTask.tsx', [
    'context.taskRegistry.register(taskState)',
    'context.taskRegistry.get<RemoteAgentTaskState>(taskId)',
    'context.taskRegistry.update<RemoteAgentTaskState>',
    'async kill(taskId, taskRegistry',
  ])
  assert.equal(remote.includes('registerTask(taskState'), false)
  assertFragments('tasks/LocalAgentTask/LocalAgentTask.tsx', [
    'taskRegistry.register(taskState)',
    'taskRegistry.update<LocalAgentTaskState>',
    'taskRegistry.get<LocalAgentTaskState>',
    'taskRegistry.remove(taskId)',
  ])
  assertFragments('tasks/LocalShellTask/LocalShellTask.tsx', [
    'taskRegistry.register(taskState)',
    'taskRegistry.update<LocalShellTaskState>',
    'backgroundExistingForegroundTask(',
  ])
  assertFragments('tasks/LocalShellTask/killShellTasks.ts', [
    'const tasks = taskRegistry.all()',
    'killTask(taskId, taskRegistry)',
  ])
  assertFragments('tasks/LocalMainSessionTask.ts', [
    'taskRegistry.register(taskState)',
    'taskRegistry.update<LocalMainSessionTaskState>',
    'completeMainSessionTask(taskId, true, taskRegistry)',
  ])
  assertFragments('tasks/DreamTask/DreamTask.ts', [
    'taskRegistry.register(task)',
    'taskRegistry.update<DreamTaskState>',
  ])
  assertFragments('tasks/InProcessTeammateTask/InProcessTeammateTask.tsx', [
    'killInProcessTeammate(taskId, taskRegistry, setAppState)',
    'taskRegistry.update<InProcessTeammateTaskState>',
  ])
  assertFragments('utils/swarm/spawnInProcess.ts', [
    'taskRegistry.register(taskState)',
    'taskRegistry.update<InProcessTeammateTaskState>',
    'registry.evictTerminal(id)',
  ])

  assertFragments('tools/AgentTool/AgentTool.tsx', [
    'taskRegistry: toolUseContext.taskRegistry',
    'toolUseContext.taskRegistry',
  ])
  assertFragments('tools/shared/spawnMultiAgent.ts', [
    'registerOutOfProcessTeammateTask(context.taskRegistry',
    'taskRegistry.register(taskState)',
    'cwd,',
  ])
  assertFragments(
    'tools/TaskStopTool/TaskStopTool.ts',
    historical
      ? ['{ taskRegistry, setAppState, abortController }', 'taskRegistry,']
      : ['const { taskRegistry, setAppState } = context', 'taskRegistry,'],
  )
  assertFragments('tools/TaskOutputTool/TaskOutputTool.tsx', [
    'toolUseContext.taskRegistry.update(task_id',
  ])
  assertFragments('tools/BashTool/BashTool.tsx', [
    'taskRegistry: toolUseContext.taskRegistry',
    'backgroundExistingForegroundTask(',
  ])
  assertFragments('tools/PowerShellTool/PowerShellTool.tsx', [
    'taskRegistry: toolUseContext.taskRegistry',
    'backgroundExistingForegroundTask(',
  ])
  assertCumulativeFragments('tools/MonitorTool/MonitorTool.ts', [
    'const { abortController, toolUseId, agentId, taskRegistry } = context',
    'killTask(taskIdRef.id, taskRegistry)',
    'taskRegistry,',
    'abortSpeculation: context.abortSpeculation',
  ])

  assertFragments('services/autoDream/autoDream.ts', [
    'const { taskRegistry } = context.toolUseContext',
    'registerDreamTask(taskRegistry',
    'completeDreamTask(taskId, taskRegistry)',
    'failDreamTask(taskId, taskRegistry)',
  ])
  assertFragments('utils/attachments.ts', [
    'toolUseContext.taskRegistry.all()',
    'toolUseContext.taskRegistry.applyOffsetsAndEvict(',
  ])
  assertFragments('utils/forkedAgent.ts', [
    'taskRegistry: parentContext.taskRegistry',
  ])
  const search = assertCumulativeFragments('utils/agenticSessionSearch.ts', [
    'taskRegistry: NOOP_TASK_REGISTRY',
    'sessionHooksRegistry,',
    'addResponseLength: () => {}',
    'applyAttributionOp: () => {}',
  ])
  assertFragments('hooks/useManagePlugins.ts', [
    'const taskRegistry = useTaskRegistry()',
    'abortController: new AbortController()',
    'taskRegistry,',
  ])
  assertCumulativeFragments('commands/autofix-pr/autofix-pr.tsx', [
    'abortController: new AbortController()',
    'taskRegistry: context.taskRegistry',
  ])
  assertFragments('commands/ultraplan.tsx', [
    'const taskRegistry = createTaskRegistry(getAppState, setAppState)',
    'taskRegistry.update<RemoteAgentTaskState>',
    'taskRegistry: createTaskRegistry(getAppState, setAppState)',
  ])
  assertCumulativeFragments('components/ultraplan/UltraplanChoiceDialog.tsx', [
    'const taskRegistry = useTaskRegistry()',
    'taskRegistry.update<RemoteAgentTaskState>',
  ])

  assertFragments('QueryEngine.ts', [
    'taskRegistry: createTaskRegistry(getAppState, setAppState)',
  ])
  assertFragments('utils/queryContext.ts', [
    'taskRegistry: createTaskRegistry(getAppState, setAppState)',
  ])
  assertFragments('cli/print.ts', [
    'taskRegistry: createTaskRegistry(getAppState, setAppState)',
  ])
  assertFragments('screens/REPL.tsx', [
    'const taskRegistry = useTaskRegistry()',
    'taskRegistry,',
    'queuePendingMessage(task.id, input, taskRegistry)',
    'injectUserMessageToTeammate(task.id, input, taskRegistry)',
  ])

  if (historical) {
    if (search) {
      assert.equal(search.includes('getToolPermissionContext:'), false)
      assert.equal(search.includes('getCacheBreakerPhrase:'), false)
    }
    const autofix = path.join(sourceRoot, 'commands/autofix-pr/autofix-pr.tsx')
    if (fs.existsSync(autofix)) {
      assert.ok(
        fs
          .readFileSync(autofix, 'utf8')
          .includes('checkRemoteAgentEligibility({ skipBundle: true })'),
      )
    }
    const choice = path.join(
      sourceRoot,
      'components/ultraplan/UltraplanChoiceDialog.tsx',
    )
    if (fs.existsSync(choice)) {
      assert.equal(fs.readFileSync(choice, 'utf8').includes('isolationLatch'), false)
    }
  } else {
    assert.ok(search.includes('getToolPermissionContext:'))
    assert.ok(search.includes('getCacheBreakerPhrase:'))
    assert.ok(
      source('components/ultraplan/UltraplanChoiceDialog.tsx').includes(
        'isolationLatch',
      ),
    )
  }
})

test('the authored registry delegates and keeps reads live', sourceOptions, async () => {
  const framework = source('utils/task/framework.ts')
  const create = functionSource(framework, 'createTaskRegistry')
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(
    `let calls = [];
     const registerTask = (...args) => calls.push(['register', ...args]);
     const updateTaskState = (...args) => calls.push(['update', ...args]);
     const evictTerminalTask = (...args) => calls.push(['evict', ...args]);
     const applyTaskOffsetsAndEvictions = (...args) => calls.push(['offsets', ...args]);
     ${create}
     export { createTaskRegistry, calls };`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const module = { exports: {} }
  new Function('exports', 'module', javascript)(module.exports, module)

  let state = { tasks: { one: { id: 'one' }, two: { id: 'two' } } }
  const setState = updater => {
    state = updater(state)
  }
  const registry = module.exports.createTaskRegistry(() => state, setState)
  const updater = task => task
  registry.register({ id: 'new' })
  registry.update('one', updater)
  registry.evictTerminal('two')
  registry.applyOffsetsAndEvict({ one: 9 }, ['two'])
  assert.deepEqual(
    module.exports.calls.map(call => call[0]),
    ['register', 'update', 'evict', 'offsets'],
  )
  assert.equal(module.exports.calls[0][2], setState)
  assert.equal(module.exports.calls[1][1], 'one')
  assert.equal(module.exports.calls[1][2], setState)
  assert.equal(module.exports.calls[1][3], updater)
  assert.deepEqual(module.exports.calls[3].slice(2), [{ one: 9 }, ['two']])

  assert.equal(registry.get('one'), state.tasks.one)
  assert.equal(registry.all(), state.tasks)
  registry.remove('one')
  assert.equal('one' in state.tasks, false)
  const same = state
  registry.remove('missing')
  assert.equal(state, same)
})

test('target116 retains the registry graph with two later call sites', latestOptions, () => {
  const latestBytes = fs.readFileSync(latestPath)
  assert.equal(
    sha256(latestBytes),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )
  const latest = latestBytes.toString('utf8')
  assert.equal((latest.match(/taskRegistry/g) ?? []).length, 80)
  for (const fragment of [
    'taskRegistry.register',
    'taskRegistry.update',
    'taskRegistry.get',
    'taskRegistry.all',
    'taskRegistry.applyOffsetsAndEvict',
  ]) {
    assert.ok(latest.includes(fragment), fragment)
  }
})

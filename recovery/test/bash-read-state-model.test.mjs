import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  buildStaleReadFileStateHint,
  cacheBashReads,
  extractCommandArguments,
  findBashReadRequests,
  findCommandNode,
  findStaleReadFileStateEntries,
  isHelpCommand,
  parseCommandArguments,
  splitParsedCommands,
  WRITE_COMMAND_MARKERS,
} from '../cases/2.1.88-to-2.1.89/recovered/bash-read-state-model.mjs'

const tokenized = new Map([
  ['cat file.txt', ['cat', 'file.txt']],
  ['cat -n file.txt', ['cat', '-n', 'file.txt']],
  ['cat a b', ['cat', 'a', 'b']],
  ["sed -n '2,3p' file.txt", ['sed', '-n', '2,3p', 'file.txt']],
  ["sed -i -n '2p' file.txt", ['sed', '-i', '-n', '2p', 'file.txt']],
  ['echo done', ['echo', 'done']],
  ['rm file.txt', ['rm', 'file.txt']],
])

const parseDependencies = {
  splitCommand(command) {
    return command.split('&&').map(part => part.trim())
  },
  parseArguments(command) {
    return tokenized.get(command) ?? command.trim().split(/\s+/)
  },
}

test('recovers the observed cat and sed command grammar', () => {
  assert.deepEqual(
    findBashReadRequests('cat -n file.txt', parseDependencies),
    [{ filePath: 'file.txt', startLine: undefined, endLine: undefined }],
  )
  assert.deepEqual(
    findBashReadRequests("sed -n '2,3p' file.txt", parseDependencies),
    [{ filePath: 'file.txt', startLine: 2, endLine: 3 }],
  )
  assert.deepEqual(
    findBashReadRequests('cat file.txt && echo done', parseDependencies),
    [{ filePath: 'file.txt', startLine: undefined, endLine: undefined }],
  )
  assert.deepEqual(
    findBashReadRequests('cat file.txt && rm file.txt', parseDependencies),
    [],
  )
  assert.deepEqual(findBashReadRequests('cat a b', parseDependencies), [])
  assert.deepEqual(
    findBashReadRequests("sed -i -n '2p' file.txt", parseDependencies),
    [],
  )
  assert.deepEqual(
    findBashReadRequests('cat file.txt | head', parseDependencies),
    [],
  )
})

test('caches full and ranged reads with the target metadata', async () => {
  const cache = new Map()
  const fakeFs = {
    async stat() {
      return { size: 12, mtimeMs: 1234.9 }
    },
    async readFile() {
      return 'one\ntwo\nthree\nfour'
    },
  }
  const dependencies = {
    ...parseDependencies,
    expandPath(filePath) {
      return `/repo/${filePath}`
    },
    getFsImplementation() {
      return fakeFs
    },
  }

  await cacheBashReads(
    "sed -n '2,3p' file.txt",
    cache,
    { aborted: false },
    dependencies,
  )
  assert.deepEqual(cache.get('/repo/file.txt'), {
    content: 'two\nthree',
    timestamp: 1234,
    offset: 2,
    limit: 2,
  })
})

test('detects formatter staleness and builds the exact model hint', async () => {
  const cache = new Map([
    ['/repo/a.ts', { timestamp: 100 }],
    ['/repo/b.ts', { timestamp: 300 }],
  ])
  const mtimes = new Map([
    ['/repo/a.ts', 250],
    ['/repo/b.ts', 350],
  ])
  const changed = await findStaleReadFileStateEntries(
    'npm run format',
    cache,
    200,
    async filename => mtimes.get(filename),
  )
  assert.deepEqual(changed.sort(), ['/repo/a.ts', '/repo/b.ts'])
  assert.equal(
    buildStaleReadFileStateHint(changed, {
      cwd: '/repo',
      relative: (cwd, filename) => filename.slice(cwd.length + 1),
      plural: (count, singular) => (count === 1 ? singular : `${singular}s`),
    }),
    "[This command modified 2 files you've previously read: a.ts, b.ts. Call Read before editing.]",
  )
  assert.deepEqual(
    await findStaleReadFileStateEntries(
      'git status',
      cache,
      0,
      async filename => mtimes.get(filename),
    ),
    [],
  )
})

test('recovers the parser bridge used by Bash read tracking', () => {
  const command = {
    type: 'command',
    text: "cat 'file'.txt",
    startIndex: 0,
    children: [
      {
        type: 'command_name',
        text: "'cat'",
        startIndex: 0,
        children: [
          {
            type: 'raw_string',
            text: "'cat'",
            startIndex: 0,
            children: [],
          },
        ],
      },
      {
        type: 'concatenation',
        text: "'file'.txt",
        startIndex: 4,
        children: [
          {
            type: 'raw_string',
            text: "'file'",
            startIndex: 4,
            children: [],
          },
          {
            type: 'word',
            text: '.txt',
            startIndex: 10,
            children: [],
          },
        ],
      },
    ],
  }
  const root = {
    type: 'program',
    text: command.text,
    startIndex: 0,
    children: [
      {
        type: 'pipeline',
        text: command.text,
        startIndex: 0,
        children: [command],
      },
    ],
  }
  assert.equal(findCommandNode(root, null), command)
  assert.deepEqual(extractCommandArguments(command), ['cat', 'file.txt'])
  assert.deepEqual(
    parseCommandArguments(command.text, () => ({ parse: () => root })),
    ['cat', 'file.txt'],
  )
  assert.deepEqual(
    splitParsedCommands(command.text, () => ({ parse: () => root })),
    [command.text],
  )
})

test(
  'semantic model matches the exact target helper when an artifact is supplied',
  { skip: !process.env.CLAUDE_CODE_2_1_89_BUNDLE },
  async () => {
    const bundle = fs.readFileSync(
      process.env.CLAUDE_CODE_2_1_89_BUNDLE,
      'utf8',
    )
    const start = bundle.indexOf('function W5Y(q)')
    const end = bundle.indexOf('var M5Y,X5Y,P5Y;', start)
    assert.notEqual(start, -1)
    assert.notEqual(end, -1)
    const generated = bundle.slice(start, end)
    const target = Function(
      'e$',
      'PM',
      'M8',
      'mq',
      'M5Y',
      'X5Y',
      'P5Y',
      `${generated}; return { find: W5Y, cache: SPK }`,
    )(
      parseDependencies.splitCommand,
      parseDependencies.parseArguments,
      () => ({
        stat: async () => ({ size: 10, mtimeMs: 42.9 }),
        readFile: async () => 'one\ntwo\nthree',
      }),
      filePath => `/repo/${filePath}`,
      /^(\d+),(\d+)p$/,
      /^(\d+)p$/,
      /^\s*(echo|printf|true|:)\b/,
    )

    const commands = [
      'cat file.txt',
      'cat -n file.txt',
      'cat a b',
      "sed -n '2,3p' file.txt",
      "sed -i -n '2p' file.txt",
      'cat file.txt && echo done',
      'cat file.txt && rm file.txt',
      'cat file.txt | head',
    ]
    for (const command of commands) {
      assert.deepEqual(
        findBashReadRequests(command, parseDependencies),
        target.find(command),
        command,
      )
    }

    const modelCache = new Map()
    const targetCache = new Map()
    const dependencies = {
      ...parseDependencies,
      expandPath: filePath => `/repo/${filePath}`,
      getFsImplementation: () => ({
        stat: async () => ({ size: 10, mtimeMs: 42.9 }),
        readFile: async () => 'one\ntwo\nthree',
      }),
    }
    await cacheBashReads(
      "sed -n '2,3p' file.txt",
      modelCache,
      { aborted: false },
      dependencies,
    )
    await target.cache(
      "sed -n '2,3p' file.txt",
      targetCache,
      { aborted: false },
    )
    assert.deepEqual(modelCache, targetCache)

    const markerStart = bundle.indexOf('V3Y=new RegExp([')
    const markerEnd = bundle.indexOf(';t4=tq(', markerStart)
    assert.notEqual(markerStart, -1)
    assert.notEqual(markerEnd, -1)
    const markerExpression = bundle
      .slice(markerStart + 'V3Y='.length, markerEnd)
    const targetMarkers = Function(`return (${markerExpression})`)()
    assert.equal(WRITE_COMMAND_MARKERS.source, targetMarkers.source)

    const staleCache = new Map([
      ['/repo/a.ts', { timestamp: 100 }],
      ['/repo/b.ts', { timestamp: 300 }],
    ])
    const staleMtimes = new Map([
      ['/repo/a.ts', 250],
      ['/repo/b.ts', 350],
    ])
    const staleStart = bundle.indexOf('async function N3Y(q,K,_)')
    const staleEnd = bundle.indexOf('async function*y3Y', staleStart)
    assert.notEqual(staleStart, -1)
    assert.notEqual(staleEnd, -1)
    const targetFindStale = Function(
      'V3Y',
      'E_6',
      `${bundle.slice(staleStart, staleEnd)}; return N3Y`,
    )(targetMarkers, async filename => staleMtimes.get(filename))
    const targetChanged = await targetFindStale(
      'npm run format',
      staleCache,
      200,
    )
    const modelChanged = await findStaleReadFileStateEntries(
      'npm run format',
      staleCache,
      200,
      async filename => staleMtimes.get(filename),
    )
    assert.deepEqual(modelChanged.sort(), targetChanged.sort())

    const parserFindStart = bundle.indexOf('function xV6(q,K)')
    const parserFindEnd = bundle.indexOf(
      'function izz(q)',
      parserFindStart,
    )
    const targetFindCommandNode = Function(
      'Rp1',
      `${bundle.slice(parserFindStart, parserFindEnd)}; return xV6`,
    )(new Set(['command', 'declaration_command']))

    const parserExtractStart = bundle.indexOf('function mo6(q)')
    const parserExtractEnd = bundle.indexOf(
      'function Sp1(q)',
      parserExtractStart,
    )
    const stripQuotes = text =>
      text.length >= 2 &&
      ((text[0] === '"' && text.at(-1) === '"') ||
        (text[0] === "'" && text.at(-1) === "'"))
        ? text.slice(1, -1)
        : text
    const targetExtractCommandArguments = Function(
      'lzz',
      'nzz',
      'Qy4',
      'Sp1',
      `${bundle.slice(
        parserExtractStart,
        parserExtractEnd,
      )}; return mo6`,
    )(
      new Set([
        'export',
        'declare',
        'typeset',
        'readonly',
        'local',
        'unset',
        'unsetenv',
      ]),
      new Set(['word', 'string', 'raw_string', 'number']),
      new Set(['command_substitution', 'process_substitution']),
      stripQuotes,
    )

    const commandNode = {
      type: 'command',
      text: "cat 'file'.txt",
      startIndex: 0,
      children: [
        {
          type: 'command_name',
          text: "'cat'",
          startIndex: 0,
          children: [
            {
              type: 'raw_string',
              text: "'cat'",
              startIndex: 0,
              children: [],
            },
          ],
        },
        {
          type: 'concatenation',
          text: "'file'.txt",
          startIndex: 4,
          children: [
            {
              type: 'raw_string',
              text: "'file'",
              startIndex: 4,
              children: [],
            },
            {
              type: 'word',
              text: '.txt',
              startIndex: 10,
              children: [],
            },
          ],
        },
      ],
    }
    const root = {
      type: 'program',
      text: commandNode.text,
      startIndex: 0,
      children: [
        {
          type: 'pipeline',
          text: commandNode.text,
          startIndex: 0,
          children: [commandNode],
        },
      ],
    }
    assert.equal(targetFindCommandNode(root, null), findCommandNode(root, null))
    assert.deepEqual(
      targetExtractCommandArguments(commandNode),
      extractCommandArguments(commandNode),
    )

    const syncParserStart = bundle.indexOf('function PM(q)')
    const syncParserEnd = bundle.indexOf(
      'function iOY(q)',
      syncParserStart,
    )
    const parserModule = () => ({ parse: () => root })
    const targetParseCommandArguments = Function(
      'n77',
      'qo',
      'xV6',
      'mo6',
      `${bundle.slice(syncParserStart, syncParserEnd)}; return PM`,
    )(
      10_000,
      parserModule,
      targetFindCommandNode,
      targetExtractCommandArguments,
    )
    assert.deepEqual(
      targetParseCommandArguments(commandNode.text),
      parseCommandArguments(commandNode.text, parserModule),
    )

    const splitStart = bundle.indexOf('function e$(q)')
    const splitEnd = bundle.indexOf('function PM(q)', splitStart)
    const targetSplitParsedCommands = Function(
      'n77',
      'qo',
      'nOY',
      'lOY',
      `${bundle.slice(splitStart, splitEnd)}; return e$`,
    )(
      10_000,
      parserModule,
      new Set(['&&', '||', '|', ';', '&', '|&', '\n']),
      new Set(['program', 'list', 'pipeline']),
    )
    assert.deepEqual(
      targetSplitParsedCommands(commandNode.text),
      splitParsedCommands(commandNode.text, parserModule),
    )

    const helpCommand = {
      type: 'command',
      text: 'tool --help',
      startIndex: 0,
      children: [
        {
          type: 'command_name',
          text: 'tool',
          startIndex: 0,
          children: [],
        },
        {
          type: 'word',
          text: '--help',
          startIndex: 5,
          children: [],
        },
      ],
    }
    const helpRoot = {
      type: 'program',
      text: helpCommand.text,
      startIndex: 0,
      children: [helpCommand],
    }
    const helpParserModule = () => ({ parse: () => helpRoot })
    const targetHelpStart = bundle.indexOf('function iOY(q)')
    const targetHelpEnd = bundle.indexOf('function YGK()', targetHelpStart)
    const targetIsHelpCommand = Function(
      'PM',
      `${bundle.slice(targetHelpStart, targetHelpEnd)}; return iOY`,
    )(() => targetExtractCommandArguments(helpCommand))
    assert.equal(
      targetIsHelpCommand(helpCommand.text),
      isHelpCommand(helpCommand.text, helpParserModule),
    )
  },
)

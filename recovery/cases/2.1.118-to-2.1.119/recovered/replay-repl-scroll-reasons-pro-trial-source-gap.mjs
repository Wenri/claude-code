#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const CASE_NAME = '2.1.118-to-2.1.119'
const REPL_PATH = 'src/screens/REPL.tsx'
const COMMAND_PATH = 'src/commands/pro-trial-expired/index.ts'

export const TARGET119_REPL_PRO_TRIAL_INPUT_FILES = Object.freeze([
  Object.freeze({
    path: REPL_PATH,
    bytes: 908262,
    sha256:
      'd871cc40a1869f421bc1d91bed4ba524292f80c4c57459b700e62b96acdd17ed',
  }),
  Object.freeze({
    path: COMMAND_PATH,
    bytes: 348,
    sha256:
      'e6ebc95a896a4880fa6ebf084a7063e2793df9bb38ba799f3874a70d8fabc610',
  }),
])

export const TARGET119_REPL_PRO_TRIAL_OUTPUT_FILES = Object.freeze([
  Object.freeze({
    path: REPL_PATH,
    bytes: 909236,
    sha256:
      '1f80c57ab7ad18b2ace737e30fd24718e30e9d301d9fa82b24feb0414781c38d',
  }),
  Object.freeze({
    path: COMMAND_PATH,
    bytes: 347,
    sha256:
      'a54bef64584b132a3e2d7d62cbf6c3224703a2f937fd476957df446fc2144b0f',
  }),
])

const IMPORT_INPUT =
  "import { startPreventSleep, stopPreventSleep } from '../services/preventSleep.js';\n"
const IMPORT_OUTPUT = `${IMPORT_INPUT}import { shouldAutoOpenProTrialExpired } from '../services/proTrial.js';
`
const REPIN_INPUT = `  const repinScroll = useCallback((force = false) => {
    if (!force && !getConfigValue('autoScrollEnabled', true).value) return;
    scrollRef.current?.scrollToBottom();
    onRepin();
    setCursor(null);
  }, [onRepin, setCursor]);`
const REPIN_OUTPUT = `  const repinScroll = useCallback((force = false, reason = '?') => {
    if (!force && !getConfigValue('autoScrollEnabled', true).value) return;
    const scrollHandle = scrollRef.current;
    if (scrollHandle && !scrollHandle.isSticky()) {
      logForDebugging(
        \`repinScroll(\${reason}, force=\${force}): yanking from scrollTop=\${scrollHandle.getScrollTop()} (max=\${Math.max(0, scrollHandle.getScrollHeight() - scrollHandle.getViewportHeight())})\`,
      );
    }
    scrollHandle?.scrollToBottom();
    onRepin();
    setCursor(null);
  }, [onRepin, setCursor]);`
const LAST_MESSAGE_INPUT = `    if (lastMsgIsHuman) {
      repinScroll();
`
const LAST_MESSAGE_OUTPUT = `    if (lastMsgIsHuman) {
      repinScroll(false, 'lastMsgIsHuman');
`
const TYPED_EMPTY_INPUT = `      repinScroll();
    }
    // Sync ref immediately (like setMessages)`
const TYPED_EMPTY_OUTPUT = `      repinScroll(false, 'typedIntoEmpty');
    }
    // Sync ref immediately (like setMessages)`
const PERMISSION_APPEAR_INPUT = `      repinScroll(true);
    } else if (prePermissionScrollTopRef.current !== null)`
const PERMISSION_APPEAR_OUTPUT = `      repinScroll(true, 'permissionDialogAppear');
    } else if (prePermissionScrollTopRef.current !== null)`
const PERMISSION_DISMISS_INPUT = `    } else {
      repinScroll(true);
    }
  }, [focusedInputDialog, repinScroll]);`
const PERMISSION_DISMISS_OUTPUT = `    } else {
      repinScroll(true, 'permissionDialogDismiss');
    }
  }, [focusedInputDialog, repinScroll]);`
const TOOL_JSX_INPUT = `      repinScroll(false);
    }
    previousHasToolJsxRef.current = hasToolJsx;`
const TOOL_JSX_OUTPUT = `      repinScroll(false, \`toolJsxDialog→\${hasToolJsx}\`);
    }
    previousHasToolJsxRef.current = hasToolJsx;`
const ON_SUBMIT_INPUT = `    repinScroll();

    // Resume loop mode`
const ON_SUBMIT_OUTPUT = `    repinScroll(false, 'onSubmit');

    // Resume loop mode`
const PRO_TRIAL_INPUT = `  }, [messages, store, setMessages]);
  const handleExit = useCallback(async () => {`
const PRO_TRIAL_OUTPUT = `  }, [messages, store, setMessages]);
  const hasAutoOpenedProTrialExpiredRef = useRef(false);
  useEffect(() => {
    if (
      hasAutoOpenedProTrialExpiredRef.current ||
      !shouldAutoOpenProTrialExpired()
    ) {
      return;
    }
    hasAutoOpenedProTrialExpiredRef.current = true;
    void onSubmitRef.current('/pro-trial-expired', {
      setCursorOffset: () => {},
      clearBuffer: () => {},
      resetHistory: () => {}
    });
  }, []);
  const handleExit = useCallback(async () => {`
const COMMAND_INPUT = '  isEnabled: () => false,'
const COMMAND_OUTPUT = '  isEnabled: () => true,'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function descriptorsEqual(left, right) {
  return left.bytes === right.bytes && left.sha256 === right.sha256
}

function replaceExactlyOnce(source, before, after, label) {
  const count = source.split(before).length - 1
  if (count !== 1) {
    throw new Error(`${CASE_NAME}: ${label} expected one anchor, got ${count}`)
  }
  return source.replace(before, () => after)
}

export function buildTarget119ReplProTrialOutputs({
  replSource,
  commandSource,
}) {
  if (typeof replSource !== 'string' || typeof commandSource !== 'string') {
    throw new TypeError('replSource and commandSource must be strings')
  }
  let recoveredRepl = replaceExactlyOnce(
    replSource,
    IMPORT_INPUT,
    IMPORT_OUTPUT,
    'pro-trial helper import',
  )
  for (const [before, after, label] of [
    [REPIN_INPUT, REPIN_OUTPUT, 'repin callback'],
    [LAST_MESSAGE_INPUT, LAST_MESSAGE_OUTPUT, 'last-message reason'],
    [TYPED_EMPTY_INPUT, TYPED_EMPTY_OUTPUT, 'typed-empty reason'],
    [PERMISSION_APPEAR_INPUT, PERMISSION_APPEAR_OUTPUT, 'permission appear reason'],
    [PERMISSION_DISMISS_INPUT, PERMISSION_DISMISS_OUTPUT, 'permission dismiss reason'],
    [TOOL_JSX_INPUT, TOOL_JSX_OUTPUT, 'tool JSX reason'],
    [ON_SUBMIT_INPUT, ON_SUBMIT_OUTPUT, 'submit reason'],
    [PRO_TRIAL_INPUT, PRO_TRIAL_OUTPUT, 'pro-trial auto-open effect'],
  ]) {
    recoveredRepl = replaceExactlyOnce(
      recoveredRepl,
      before,
      after,
      label,
    )
  }
  const recoveredCommand = replaceExactlyOnce(
    commandSource,
    COMMAND_INPUT,
    COMMAND_OUTPUT,
    'pro-trial command enablement',
  )
  return Object.freeze({
    [REPL_PATH]: recoveredRepl,
    [COMMAND_PATH]: recoveredCommand,
  })
}

function resolveSourceFile(sourceRoot, sourcePath) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const root = fs.realpathSync(path.resolve(sourceRoot))
  const filename = path.resolve(root, sourcePath.slice('src/'.length))
  const relative = path.relative(root, filename)
  if (
    relative === '' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${sourcePath}: escapes the supplied source root`)
  }
  return filename
}

function readRealFile(filename, sourcePath) {
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${sourcePath}: expected a real source file`)
  }
  if (fs.realpathSync(filename) !== filename) {
    throw new Error(`${sourcePath}: source path resolves through a symlink`)
  }
  return fs.readFileSync(filename)
}

export function applyTarget119ReplProTrialSourceRecovery({ sourceRoot } = {}) {
  const current = Object.fromEntries(
    TARGET119_REPL_PRO_TRIAL_INPUT_FILES.map(input => {
      const filename = resolveSourceFile(sourceRoot, input.path)
      return [input.path, { filename, value: readRealFile(filename, input.path) }]
    }),
  )
  const actual = Object.fromEntries(
    Object.entries(current).map(([sourcePath, item]) => [
      sourcePath,
      descriptor(item.value),
    ]),
  )
  const allRecovered = TARGET119_REPL_PRO_TRIAL_OUTPUT_FILES.every(output =>
    descriptorsEqual(actual[output.path], output),
  )
  if (allRecovered) return { status: 'already-recovered', files: [] }
  const allRaw = TARGET119_REPL_PRO_TRIAL_INPUT_FILES.every(input =>
    descriptorsEqual(actual[input.path], input),
  )
  if (!allRaw) {
    throw new Error(
      `${CASE_NAME}: REPL/pro-trial replay requires an exact all-raw or all-recovered source graph; got ${Object.entries(actual)
        .map(([sourcePath, value]) => `${sourcePath}=${value.bytes}/${value.sha256}`)
        .join(', ')}`,
    )
  }
  const recovered = buildTarget119ReplProTrialOutputs({
    replSource: current[REPL_PATH].value.toString('utf8'),
    commandSource: current[COMMAND_PATH].value.toString('utf8'),
  })
  for (const output of TARGET119_REPL_PRO_TRIAL_OUTPUT_FILES) {
    const value = Buffer.from(recovered[output.path])
    if (!descriptorsEqual(descriptor(value), output)) {
      throw new Error(
        `${CASE_NAME}: REPL/pro-trial replay produced unexpected ${output.path}`,
      )
    }
  }
  for (const output of TARGET119_REPL_PRO_TRIAL_OUTPUT_FILES) {
    fs.writeFileSync(current[output.path].filename, recovered[output.path])
  }
  return {
    status: 'recovered',
    files: TARGET119_REPL_PRO_TRIAL_OUTPUT_FILES.map(output => output.path),
  }
}

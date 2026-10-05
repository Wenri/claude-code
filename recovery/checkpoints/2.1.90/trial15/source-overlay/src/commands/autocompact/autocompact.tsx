import { c as _c } from "react/compiler-runtime";
import * as React from 'react';
import { useState } from 'react';
import { Dialog } from '../../components/design-system/Dialog.js';
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js';
import { Box, Text } from '../../ink.js';
import { useKeybindings } from '../../keybindings/useKeybinding.js';
import { logEvent } from '../../services/analytics/index.js';
import { isAutoCompactEnabled, resolveAutoCompactWindow } from '../../services/compact/autoCompact.js';
import { useAppState } from '../../state/AppState.js';
import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js';
import { formatTokens } from '../../utils/format.js';
import { applyAutoCompactWindow } from './autocompact-noninteractive.js';
const LEARN_MORE = 'https://claude.com/blog/1m-context-ga';
const STEP = 100_000;
const MINIMUM = 100_000;
const MAXIMUM = 1_000_000;
const MODEL_DEFAULT = 0;
function AutoCompactDialog(t0) {
  const $ = _c(45);
  const {
    onDone,
    context
  } = t0;
  const configuredWindow = useAppState(_temp);
  const model = useMainLoopModel();
  let t1;
  if ($[0] !== configuredWindow || $[1] !== model) {
    t1 = resolveAutoCompactWindow(model, configuredWindow);
    $[0] = configuredWindow;
    $[1] = model;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  const {
    window: effectiveWindow,
    configured,
    source
  } = t1;
  let t2;
  if ($[3] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = isAutoCompactEnabled();
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  const enabled = t2;
  const capped = configured > effectiveWindow;
  const environmentOverride = source === "env";
  const sourceLabel = source === "env" ? "from CLAUDE_CODE_AUTO_COMPACT_WINDOW" : source === "settings" ? "from settings" : "model default";
  const initialSelection = source === "model" ? MODEL_DEFAULT : Math.min(MAXIMUM, Math.max(MINIMUM, Math.round(configured / STEP) * STEP));
  const [selection, setSelection] = useState(initialSelection);
  const [changed, setChanged] = useState(false);
  let t3;
  if ($[4] !== environmentOverride) {
    t3 = function move(direction) {
      if (environmentOverride) {
        return;
      }
      setChanged(true);
      setSelection(previous => {
        if (previous === MODEL_DEFAULT) {
          return direction > 0 ? MINIMUM : MAXIMUM;
        }
        const next = previous + direction * STEP;
        if (next < MINIMUM) {
          return MODEL_DEFAULT;
        }
        if (next > MAXIMUM) {
          return MODEL_DEFAULT;
        }
        return next;
      });
    };
    $[4] = environmentOverride;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  const move = t3;
  let t4;
  if ($[6] !== capped || $[7] !== effectiveWindow) {
    t4 = capped ? ` · capped to ${formatTokens(effectiveWindow)} by model` : "";
    $[6] = capped;
    $[7] = effectiveWindow;
    $[8] = t4;
  } else {
    t4 = $[8];
  }
  const cappedLabel = t4;
  let t5;
  if ($[9] !== configured) {
    t5 = formatTokens(configured);
    $[9] = configured;
    $[10] = t5;
  } else {
    t5 = $[10];
  }
  const current = `${t5} tokens (${sourceLabel})${cappedLabel}`;
  let t6;
  if ($[11] !== changed || $[12] !== context || $[13] !== current || $[14] !== onDone || $[15] !== selection) {
    t6 = function finish() {
      if (!changed) {
        onDone(`Auto-compact window unchanged: ${current}`);
        return;
      }
      const value = selection === MODEL_DEFAULT ? "reset" : String(selection);
      onDone(applyAutoCompactWindow(value, context));
    };
    $[11] = changed;
    $[12] = context;
    $[13] = current;
    $[14] = onDone;
    $[15] = selection;
    $[16] = t6;
  } else {
    t6 = $[16];
  }
  const finish = t6;
  let t7;
  let t8;
  if ($[17] !== move) {
    t7 = () => move(1);
    t8 = () => move(-1);
    $[17] = move;
    $[18] = t7;
    $[19] = t8;
  } else {
    t7 = $[18];
    t8 = $[19];
  }
  let t9;
  if ($[20] !== finish || $[21] !== t7 || $[22] !== t8) {
    t9 = {
      "select:previous": t7,
      "select:next": t8,
      "select:accept": finish
    };
    $[20] = finish;
    $[21] = t7;
    $[22] = t8;
    $[23] = t9;
  } else {
    t9 = $[23];
  }
  let t10;
  if ($[24] === Symbol.for("react.memo_cache_sentinel")) {
    t10 = {
      context: "Select"
    };
    $[24] = t10;
  } else {
    t10 = $[24];
  }
  useKeybindings(t9, t10);
  let t11;
  if ($[25] !== move) {
    t11 = {
      "tabs:next": () => move(1),
      "tabs:previous": () => move(-1)
    };
    $[25] = move;
    $[26] = t11;
  } else {
    t11 = $[26];
  }
  let t12;
  if ($[27] === Symbol.for("react.memo_cache_sentinel")) {
    t12 = {
      context: "Tabs"
    };
    $[27] = t12;
  } else {
    t12 = $[27];
  }
  useKeybindings(t11, t12);
  let t13;
  if ($[28] !== selection) {
    t13 = selection === MODEL_DEFAULT ? "Model default" : `${formatTokens(selection)} tokens`;
    $[28] = selection;
    $[29] = t13;
  } else {
    t13 = $[29];
  }
  const displayLabel = t13;
  const t14 = `Current setting: ${current}`;
  let t15;
  if ($[30] !== current || $[31] !== onDone) {
    t15 = () => onDone(`Auto-compact window unchanged: ${current}`);
    $[30] = current;
    $[31] = onDone;
    $[32] = t15;
  } else {
    t15 = $[32];
  }
  let t16;
  let t17;
  if ($[33] === Symbol.for("react.memo_cache_sentinel")) {
    t16 = <Text>This command configures when auto-compaction happens. The actual threshold is the minimum of this setting and your model's context window.</Text>;
    t17 = !enabled && <Text color="warning">Auto-compact is currently disabled (see /config)</Text>;
    $[33] = t16;
    $[34] = t17;
  } else {
    t16 = $[33];
    t17 = $[34];
  }
  let t18;
  if ($[35] !== displayLabel || $[36] !== environmentOverride) {
    t18 = environmentOverride ? <Text color="warning">CLAUDE_CODE_AUTO_COMPACT_WINDOW is set and takes precedence. Unset it to change this setting here.</Text> : <Box><Text>Select auto-compact window: </Text><Text bold={true} color="suggestion">{displayLabel}</Text></Box>;
    $[35] = displayLabel;
    $[36] = environmentOverride;
    $[37] = t18;
  } else {
    t18 = $[37];
  }
  let t19;
  if ($[38] === Symbol.for("react.memo_cache_sentinel")) {
    t19 = <Box flexDirection="column" marginTop={1}><Text bold={true}>Long context that holds up</Text><Text>Both Opus 4.6 and Sonnet 4.6 achieve state-of-the-art scores on long-context retrieval benchmarks at 1M tokens — Opus 4.6 scores 78.3% on MRCR v2, the highest among frontier models at that length. Opus 4.6 includes 1M context at standard pricing; Sonnet 4.6 1M is available with overages.</Text><Text dimColor={true}>Learn more: {LEARN_MORE}</Text></Box>;
    $[38] = t19;
  } else {
    t19 = $[38];
  }
  let t20;
  if ($[39] !== t18) {
    t20 = <Box flexDirection="column" gap={1}>{t16}{t17}{t18}{t19}</Box>;
    $[39] = t18;
    $[40] = t20;
  } else {
    t20 = $[40];
  }
  let t21;
  if ($[41] !== t14 || $[42] !== t15 || $[43] !== t20) {
    t21 = <Dialog title="Auto-compact" subtitle={t14} onCancel={t15} inputGuide={_temp2}>{t20}</Dialog>;
    $[41] = t14;
    $[42] = t15;
    $[43] = t20;
    $[44] = t21;
  } else {
    t21 = $[44];
  }
  return t21;
}
function _temp2() {
  return <Text dimColor={true}>↑/↓ to change · Enter to apply · Esc to cancel</Text>;
}
function _temp(state) {
  return state.autoCompactWindow;
}
export const call = async (onDone: LocalJSXCommandOnDone, context: LocalJSXCommandContext, args?: string): Promise<React.ReactNode> => {
  const value = args?.trim() || '';
  if (value) {
    const result = applyAutoCompactWindow(value, context);
    onDone(result);
    return null;
  }
  logEvent('tengu_autocompact_dialog_opened', {
    source: 'dialog'
  });
  return <AutoCompactDialog onDone={onDone} context={context} />;
};

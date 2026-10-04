// Reconstructed 2.1.89 hatch module boundary; not an authenticated original path.
import { c as _c } from 'react/compiler-runtime';
import React, { useEffect, useState } from 'react';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { Box, Text } from '../../ink.js';
import { getRainbowColor } from '../../utils/thinking.js';
import { CompanionCard } from './CompanionCard.js';

const EGG_TICK_MS = 160;

const SHAKE_FRAME_COUNT = 4;

const SHAKE_CYCLES = 3;

const EGG = ['    _____    ', '   /     \\   ', '  /       \\  ', ' |         | ', '  \\       /  ', '   \\_____/   '];

const EGG_FRAMES = [{
  offset: 0,
  lines: EGG
}, {
  offset: 1,
  lines: EGG
}, {
  offset: -1,
  lines: EGG
}, {
  offset: 1,
  lines: EGG
}, {
  offset: 0,
  lines: ['    _____    ', '   /     \\   ', '  /       \\  ', ' |    .    | ', '  \\       /  ', '   \\_____/   ']
}, {
  offset: -1,
  lines: ['    _____    ', '   /     \\   ', '  /       \\  ', ' |    ∕    | ', '  \\       /  ', '   \\_____/   ']
}, {
  offset: 1,
  lines: ['    _____    ', '   /     \\   ', '  /   .   \\  ', ' |   ∕ \\   | ', '  \\       /  ', '   \\_____/   ']
}, {
  offset: 0,
  lines: ['    _____    ', '   /  .  \\   ', '  /  ∕ \\  \\  ', ' |  ∕   \\  | ', '  \\   .   /  ', '   \\_____/   ']
}, {
  offset: -1,
  lines: ['    _____    ', '   / ∕ \\ \\   ', '  / ∕   \\ \\  ', ' | ∕     \\ | ', '  \\   ∨   /  ', '   \\__∨__/   ']
}, {
  offset: 1,
  lines: ['    __ __    ', '   / V V \\   ', '  / ∕   \\ \\  ', ' | ∕     \\ | ', '  \\   ∨   /  ', '   \\__∨__/   ']
}, {
  offset: 0,
  lines: ['   ·  ✦  ·   ', '  ·       ·  ', ' ·    ✦    · ', '  ✦       ✦  ', ' ·    ·    · ', '   ·  ✦  ·   ']
}] as const;

const CRACK_FRAME_COUNT = EGG_FRAMES.length - SHAKE_FRAME_COUNT;

export function BuddyHatch(t0) {
  const $ = _c(34);
  const {
    hatching,
    onDone
  } = t0;
  const {
    columns
  } = useTerminalSize();
  const [tick, setTick] = useState(0);
  const [resolved, setResolved] = useState(null);
  const [crackStartedAt, setCrackStartedAt] = useState(null);
  const [hatched, setHatched] = useState(null);
  let t1;
  let t2;
  if ($[0] !== hatching) {
    t1 = () => {
      const timer = setInterval(_temp2, EGG_TICK_MS, setTick);
      hatching.then(setResolved);
      return () => clearInterval(timer);
    };
    t2 = [hatching];
    $[0] = hatching;
    $[1] = t1;
    $[2] = t2;
  } else {
    t1 = $[1];
    t2 = $[2];
  }
  useEffect(t1, t2);
  const shakeTicks = SHAKE_CYCLES * SHAKE_FRAME_COUNT;
  if (crackStartedAt === null && resolved !== null && tick >= shakeTicks) {
    setCrackStartedAt(tick);
  }
  let frameIndex;
  if (crackStartedAt === null) {
    frameIndex = tick % SHAKE_FRAME_COUNT;
  } else {
    const elapsed = tick - crackStartedAt;
    if (elapsed < CRACK_FRAME_COUNT) {
      frameIndex = SHAKE_FRAME_COUNT + elapsed;
    } else {
      frameIndex = EGG_FRAMES.length - 1;
      if (!hatched && resolved) {
        setHatched(resolved);
      }
    }
  }
  if (hatched) {
    let t3;
    if ($[3] !== hatched || $[4] !== onDone) {
      t3 = <CompanionCard companion={hatched} onDone={onDone} />;
      $[3] = hatched;
      $[4] = onDone;
      $[5] = t3;
    } else {
      t3 = $[5];
    }
    let t4;
    if ($[6] !== hatched.name) {
      t4 = <Text dimColor={true}>{hatched.name} is here · it'll chime in as you code</Text>;
      $[6] = hatched.name;
      $[7] = t4;
    } else {
      t4 = $[7];
    }
    let t5;
    let t6;
    if ($[8] === Symbol.for("react.memo_cache_sentinel")) {
      t5 = <Text dimColor={true}>your buddy won't count toward your usage</Text>;
      t6 = <Text dimColor={true}>say its name to get its take · /buddy pet · /buddy off</Text>;
      $[8] = t5;
      $[9] = t6;
    } else {
      t5 = $[8];
      t6 = $[9];
    }
    let t7;
    if ($[10] === Symbol.for("react.memo_cache_sentinel")) {
      t7 = <Box marginTop={1}><Text dimColor={true}>press any key</Text></Box>;
      $[10] = t7;
    } else {
      t7 = $[10];
    }
    let t8;
    if ($[11] !== t4) {
      t8 = <Box flexDirection="column" marginTop={1}>{t4}{t5}{t6}{t7}</Box>;
      $[11] = t4;
      $[12] = t8;
    } else {
      t8 = $[12];
    }
    let t9;
    if ($[13] !== t3 || $[14] !== t8) {
      t9 = <Box flexDirection="column">{t3}{t8}</Box>;
      $[13] = t3;
      $[14] = t8;
      $[15] = t9;
    } else {
      t9 = $[15];
    }
    return t9;
  }
  const frame = EGG_FRAMES[frameIndex];
  let t3;
  if ($[16] !== frame.offset) {
    t3 = " ".repeat(1 + frame.offset);
    $[16] = frame.offset;
    $[17] = t3;
  } else {
    t3 = $[17];
  }
  const leftPad = t3;
  let t4;
  if ($[18] !== frame.offset) {
    t4 = " ".repeat(1 - frame.offset);
    $[18] = frame.offset;
    $[19] = t4;
  } else {
    t4 = $[19];
  }
  const rightPad = t4;
  let t5;
  if ($[20] !== tick) {
    t5 = getRainbowColor(tick);
    $[20] = tick;
    $[21] = t5;
  } else {
    t5 = $[21];
  }
  let t6;
  if ($[22] !== frame.lines || $[23] !== leftPad || $[24] !== rightPad) {
    let t7;
    if ($[26] !== leftPad || $[27] !== rightPad) {
      t7 = (line, index) => <Text key={index}>{leftPad}{line}{rightPad}</Text>;
      $[26] = leftPad;
      $[27] = rightPad;
      $[28] = t7;
    } else {
      t7 = $[28];
    }
    t6 = frame.lines.map(t7);
    $[22] = frame.lines;
    $[23] = leftPad;
    $[24] = rightPad;
    $[25] = t6;
  } else {
    t6 = $[25];
  }
  let t7;
  if ($[29] === Symbol.for("react.memo_cache_sentinel")) {
    t7 = <Box flexDirection="column" alignItems="center" marginTop={1}><Text dimColor={true}>hatching a coding buddy…</Text><Text dimColor={true}>it'll watch you work and occasionally have opinions</Text></Box>;
    $[29] = t7;
  } else {
    t7 = $[29];
  }
  let t8;
  if ($[30] !== columns || $[31] !== t5 || $[32] !== t6) {
    t8 = <Box flexDirection="column" alignItems="center" width={columns} borderStyle="round" borderColor={t5} paddingY={1}>{t6}{t7}</Box>;
    $[30] = columns;
    $[31] = t5;
    $[32] = t6;
    $[33] = t8;
  } else {
    t8 = $[33];
  }
  return t8;
}

function _temp2(setT) {
  return setT(_temp);
}

function _temp(value) {
  return value + 1;
}


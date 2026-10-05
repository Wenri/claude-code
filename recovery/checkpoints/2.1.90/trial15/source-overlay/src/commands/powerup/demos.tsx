import { c as _c } from 'react/compiler-runtime';
import sample from 'lodash-es/sample.js';
import { computeShimmerSegments } from '../../bridge/bridgeStatusUtil.js';
import { BLACK_CIRCLE, DIAMOND_FILLED, DIAMOND_OPEN, EFFORT_MEDIUM, PAUSE_ICON } from '../../constants/figures.js';
import { useSettings } from '../../hooks/useSettings.js';
import { stringWidth } from '../../ink/stringWidth.js';
import { Box, Text, useAnimationFrame } from '../../ink.js';
import { useKeybindings } from '../../keybindings/useKeybinding.js';
import { useShortcutDisplay } from '../../keybindings/useShortcutDisplay.js';
import * as React from 'react';
import { useMemo, useRef, useEffect, useState } from 'react';

const DEMO_INTERVAL_MS = 3000;

const DEMO_WIDTH = 48;

const DEMO_HEIGHT = 3;

const FRAME_MARKUP = /\[(\w+):([^\]]*)\]/g;

const MODES = [{
  label: 'default',
  symbol: '',
  color: 'text'
}, {
  label: 'accept edits on',
  symbol: '⏵⏵',
  color: 'autoAccept'
}, {
  label: 'plan mode on',
  symbol: PAUSE_ICON,
  color: 'planMode'
}, {
  label: 'auto mode on',
  symbol: '⏵⏵',
  color: 'warning'
}] as const;

const SHIMMER_INTERVAL_MS = 80;

const CONFETTI_INTERVAL_MS = 60;

const CONFETTI_DURATION_MS = 1400;

const CONFETTI_ROWS = 16;

const CONFETTI_MARGIN_LEFT = 60;

const CONFETTI_WIDTH = 100;

const CONFETTI_CHARS = [DIAMOND_FILLED, DIAMOND_OPEN, BLACK_CIRCLE, '·'];

const CONFETTI_COLORS = ['claude', 'success', 'warning', 'suggestion', 'autoAccept'];

type DemoSegment = {
  text: string;
  color?: string;
};

type DemoLine = {
  dim: boolean;
  segments: DemoSegment[];
};

type ConfettiParticle = {
  x: number;
  delay: number;
  speed: number;
  char: string;
  color: string;
};

function DemoBox(t0) {
  const $ = _c(10);
  const {
    live,
    boxRef,
    children
  } = t0;
  let t1;
  if ($[0] !== children) {
    t1 = <Box flexDirection="column" width={DEMO_WIDTH - 4} height={DEMO_HEIGHT}>{children}</Box>;
    $[0] = children;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const t2 = !live;
  const t3 = live ? "claude" : undefined;
  const t4 = live ? `${DIAMOND_FILLED} try it` : `  ${EFFORT_MEDIUM} demo`;
  let t5;
  if ($[2] !== t2 || $[3] !== t3 || $[4] !== t4) {
    t5 = <Box position="absolute" marginLeft={DEMO_WIDTH - 12}><Text dimColor={t2} color={t3}>{t4}</Text></Box>;
    $[2] = t2;
    $[3] = t3;
    $[4] = t4;
    $[5] = t5;
  } else {
    t5 = $[5];
  }
  let t6;
  if ($[6] !== boxRef || $[7] !== t1 || $[8] !== t5) {
    t6 = <Box ref={boxRef} borderStyle="round" borderColor="inactive" paddingX={1} width={DEMO_WIDTH} height={DEMO_HEIGHT + 2}>{t1}{t5}</Box>;
    $[6] = boxRef;
    $[7] = t1;
    $[8] = t5;
    $[9] = t6;
  } else {
    t6 = $[9];
  }
  return t6;
}

function parsePowerupDemoLine(line: string): DemoLine {
  const dim = line.startsWith('#');
  const text = dim ? line.slice(1) : line;
  const segments: DemoSegment[] = [];
  let offset = 0;
  for (const match of text.matchAll(FRAME_MARKUP)) {
    if (match.index > offset) {
      segments.push({
        text: text.slice(offset, match.index)
      });
    }
    segments.push({
      text: match[2]!,
      color: match[1]
    });
    offset = match.index + match[0].length;
  }
  if (offset < text.length) segments.push({
    text: text.slice(offset)
  });
  if (segments.length === 0) segments.push({
    text: ''
  });
  return {
    dim,
    segments
  };
}

function AnimatedDemo(t0) {
  const $ = _c(7);
  const {
    frames
  } = t0;
  let t1;
  if ($[0] !== frames) {
    t1 = frames.map(_temp);
    $[0] = frames;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const parsedFrames = t1;
  const prefersReducedMotion = useSettings().prefersReducedMotion ?? false;
  const [boxRef, time] = useAnimationFrame(prefersReducedMotion ? null : DEMO_INTERVAL_MS);
  const frameIndex = Math.floor(time / DEMO_INTERVAL_MS) % parsedFrames.length;
  const frame_0 = parsedFrames[frameIndex];
  let t2;
  if ($[2] !== frame_0) {
    t2 = frame_0.map(_temp3);
    $[2] = frame_0;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== boxRef || $[5] !== t2) {
    t3 = <DemoBox boxRef={boxRef}>{t2}</DemoBox>;
    $[4] = boxRef;
    $[5] = t2;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  return t3;
}

function _temp3(line, lineIndex) {
  return <Text key={lineIndex} dimColor={line.dim}>{line.segments.map(_temp2)}</Text>;
}

function _temp2(segment, segmentIndex) {
  return <Text key={segmentIndex} color={segment.color}>{segment.text}</Text>;
}

function _temp(frame) {
  return frame.split("\n").map(parsePowerupDemoLine);
}

function createPowerupConfetti(count: number): ConfettiParticle[] {
  const particles: ConfettiParticle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.floor(Math.random() * CONFETTI_WIDTH),
      delay: Math.random() * 400,
      speed: 0.7 + Math.random() * 0.6,
      char: sample(CONFETTI_CHARS)!,
      color: sample(CONFETTI_COLORS)!
    });
  }
  return particles;
}

function Celebration({
  onDone
}: {
  onDone: () => void;
}): React.ReactNode {
  const particles = useMemo(() => createPowerupConfetti(40), []);
  const prefersReducedMotion = useSettings().prefersReducedMotion ?? false;
  const [boxRef, time] = useAnimationFrame(prefersReducedMotion ? null : CONFETTI_INTERVAL_MS);
  const initialTime = useRef(time);
  const elapsed = time - initialTime.current;
  useEffect(() => {
    const timeout = setTimeout(onDone, CONFETTI_DURATION_MS + 600);
    return () => clearTimeout(timeout);
  }, [onDone]);
  const rows: ConfettiParticle[][] = Array.from({
    length: CONFETTI_ROWS
  }, () => []);
  for (const particle of particles) {
    const adjustedElapsed = Math.max(0, elapsed - particle.delay);
    const row = Math.floor(adjustedElapsed / CONFETTI_DURATION_MS * CONFETTI_ROWS * particle.speed);
    if (row >= 0 && row < CONFETTI_ROWS) rows[row]!.push(particle);
  }
  for (const row_0 of rows) row_0.sort((a, b) => a.x - b.x);
  return <Box ref={boxRef} position="absolute" marginLeft={CONFETTI_MARGIN_LEFT} flexDirection="column" width={CONFETTI_WIDTH} height={CONFETTI_ROWS}>
      {rows.map((row_1, rowIndex) => {
      let previousX = 0;
      return <Box key={rowIndex} height={1}>
            {row_1.map((particle_0, particleIndex) => {
          const padding = Math.max(0, particle_0.x - previousX);
          previousX = Math.max(previousX, particle_0.x) + 1;
          return <Text key={particleIndex}>
                  {' '.repeat(padding)}
                  <Text color={particle_0.color}>{particle_0.char}</Text>
                </Text>;
        })}
          </Box>;
    })}
    </Box>;
}

function ShimmerTitle(t0) {
  const $ = _c(14);
  const {
    text
  } = t0;
  const width = stringWidth(text);
  const prefersReducedMotion = useSettings().prefersReducedMotion ?? false;
  const [boxRef, time] = useAnimationFrame(prefersReducedMotion ? null : SHIMMER_INTERVAL_MS);
  const cycleWidth = width + 20;
  const glimmerIndex = Math.floor(time / SHIMMER_INTERVAL_MS) % cycleWidth - 10;
  let t1;
  if ($[0] !== glimmerIndex || $[1] !== text) {
    t1 = computeShimmerSegments(text, glimmerIndex);
    $[0] = glimmerIndex;
    $[1] = text;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  const {
    before,
    shimmer,
    after
  } = t1;
  let t2;
  if ($[3] !== before) {
    t2 = <Text bold={true} color="claude">{before}</Text>;
    $[3] = before;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  let t3;
  if ($[5] !== shimmer) {
    t3 = <Text bold={true} color="claudeShimmer">{shimmer}</Text>;
    $[5] = shimmer;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  let t4;
  if ($[7] !== after) {
    t4 = <Text bold={true} color="claude">{after}</Text>;
    $[7] = after;
    $[8] = t4;
  } else {
    t4 = $[8];
  }
  let t5;
  if ($[9] !== boxRef || $[10] !== t2 || $[11] !== t3 || $[12] !== t4) {
    t5 = <Box ref={boxRef}>{t2}{t3}{t4}</Box>;
    $[9] = boxRef;
    $[10] = t2;
    $[11] = t3;
    $[12] = t4;
    $[13] = t5;
  } else {
    t5 = $[13];
  }
  return t5;
}

function LiveModeDemo() {
  const $ = _c(11);
  const [mode, setMode] = useState(0);
  const current = MODES[mode];
  const shortcut = useShortcutDisplay("chat:cycleMode", "Chat", "shift+tab");
  let t0;
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = {
      "confirm:cycleMode": () => setMode(_temp4)
    };
    t1 = {
      context: "Confirmation"
    };
    $[0] = t0;
    $[1] = t1;
  } else {
    t0 = $[0];
    t1 = $[1];
  }
  useKeybindings(t0, t1);
  let t2;
  if ($[2] !== shortcut) {
    t2 = <Text dimColor={true}>Press {shortcut} now{"\n\n"}</Text>;
    $[2] = shortcut;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  const symbol = current.symbol ? `${current.symbol} ` : "  ";
  let t3;
  if ($[4] !== current.color || $[5] !== current.label || $[6] !== symbol) {
    t3 = <Text color={current.color}>{symbol}{current.label}</Text>;
    $[4] = current.color;
    $[5] = current.label;
    $[6] = symbol;
    $[7] = t3;
  } else {
    t3 = $[7];
  }
  let t4;
  if ($[8] !== t2 || $[9] !== t3) {
    t4 = <DemoBox live={true}><Text>{t2}{t3}</Text></DemoBox>;
    $[8] = t2;
    $[9] = t3;
    $[10] = t4;
  } else {
    t4 = $[10];
  }
  return t4;
}

function _temp4(previous) {
  return (previous + 1) % MODES.length;
}

export { AnimatedDemo, Celebration, ShimmerTitle, LiveModeDemo };

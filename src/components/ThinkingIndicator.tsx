import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Box, Text } from '../ink.js';
import { MessageResponse } from './MessageResponse.js';
import { ToolUseLoader } from './ToolUseLoader.js';

const THINKING_HINTS = [{
  afterMs: 1000,
  text: 'Hmm…'
}, {
  afterMs: 6000,
  text: 'This one needs a moment…'
}, {
  afterMs: 12000,
  text: 'Working through it…'
}, {
  afterMs: 20000,
  text: 'Untangling some thoughts…'
}, {
  afterMs: 28000,
  text: 'Weighing a few approaches…'
}, {
  afterMs: 36000,
  text: 'Consulting the rubber duck…'
}, {
  afterMs: 48000,
  text: 'Cross-referencing seventeen theories…'
}, {
  afterMs: 60000,
  text: 'Double-checking the double-checks…'
}, {
  afterMs: 80000,
  text: 'Almost there…'
}, {
  afterMs: 108000,
  text: 'Pacing in small circles…'
}, {
  afterMs: 120000,
  text: 'Reticulating splines…'
}, {
  afterMs: 135000,
  text: 'Hmm…?'
}, {
  afterMs: 150000,
  text: 'Staring thoughtfully into the middle distance…'
}, {
  afterMs: 165000,
  text: 'Still here, still at it…'
}];

type Props = {
  isLoading: boolean;
};

export function ThinkingIndicator({
  isLoading
}: Props): React.ReactNode {
  const [hintIndex, setHintIndex] = useState(-1);
  const hintIndexRef = useRef(hintIndex);
  hintIndexRef.current = hintIndex;

  useEffect(() => {
    if (!isLoading) {
      if (hintIndexRef.current !== -1) setHintIndex(-1);
      return;
    }
    const timers = THINKING_HINTS.map((hint, index) => setTimeout(setHintIndex, hint.afterMs, index));
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [isLoading]);

  if (hintIndex < 0 || !isLoading) return null;

  return <Box flexDirection="column" marginTop={1} width="100%">
      <Box flexDirection="row">
        <ToolUseLoader shouldAnimate={true} isUnresolved={true} isError={false} />
        <Text>Thinking</Text>
      </Box>
      <MessageResponse>
        <Text dimColor={true}>{THINKING_HINTS[hintIndex]!.text}</Text>
      </MessageResponse>
    </Box>;
}

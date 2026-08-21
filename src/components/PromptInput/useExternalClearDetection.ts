import { useEffect, useRef } from 'react';
import useStdin from '../../ink/hooks/use-stdin.js';
import instances from '../../ink/instances.js';
import { env } from '../../utils/env.js';
import { isFullscreenEnvEnabled } from '../../utils/fullscreen.js';
import { sleep } from '../../utils/sleep.js';

export function useExternalClearDetection(onExternalClear: () => void): void {
  const callbackRef = useRef(onExternalClear);
  callbackRef.current = onExternalClear;
  const { internal_querier: querier } = useStdin();

  useEffect(() => {
    if (!isFullscreenEnvEnabled() || !querier) return;
    if (env.terminal !== 'iTerm.app' && env.terminal !== 'Apple_Terminal') return;
    const ink = instances.get(process.stdout);
    if (!ink) return;
    const controller = new AbortController();
    void (async () => {
      while (!controller.signal.aborted) {
        const detected = await ink.probeExternalClear(querier);
        if (controller.signal.aborted) return;
        if (detected) callbackRef.current();
        await sleep(200, controller.signal, { unref: true });
      }
    })();
    return () => controller.abort();
  }, [querier]);
}

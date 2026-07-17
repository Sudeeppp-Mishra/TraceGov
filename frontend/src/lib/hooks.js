import { useEffect, useRef } from 'react';

/**
 * Runs `fn` immediately, then every `intervalMs`. Pauses while the tab is
 * hidden and fires a catch-up run when it becomes visible again.
 */
export function usePolling(fn, intervalMs, { enabled = true } = {}) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return undefined;

    let timer = null;
    const tick = () => fnRef.current();
    const start = () => {
      tick();
      timer = setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else if (!timer) start();
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, enabled]);
}

// One in-flight request, at most one start per interval; intermediate values
// are replaced, never queued. A final value uses the same rate limit.
export function latestValueSender(
  send: (value: number) => Promise<unknown>,
  interval = 1000
) {
  let pending: number | undefined;
  let lastValue: number | undefined;
  let lastStart = -Infinity;
  let inFlight = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (delay: number) => {
    if (disposed || inFlight || timer || pending === undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, delay);
  };
  const flush = async () => {
    if (disposed || inFlight || pending === undefined) return;
    const remaining = interval - (Date.now() - lastStart);
    if (remaining > 0) {
      schedule(remaining);
      return;
    }
    const value = pending;
    pending = undefined;
    if (value === lastValue) return;
    inFlight = true;
    lastStart = Date.now();
    try {
      await send(value);
      lastValue = value;
    } catch {
      /* The caller presents command errors; never retry automatically. */
    } finally {
      inFlight = false;
      schedule(Math.max(0, interval - (Date.now() - lastStart)));
    }
  };
  return {
    change(value: number, final = false) {
      if (disposed) return;
      pending = value;
      if (final) {
        clearTimeout(timer);
        timer = undefined;
        void flush();
      } else schedule(Math.max(interval, interval - (Date.now() - lastStart)));
    },
    busy: () => inFlight || pending !== undefined,
    observe(value: number) {
      if (!inFlight && pending === undefined) lastValue = value;
    },
    dispose() {
      disposed = true;
      pending = undefined;
      clearTimeout(timer);
    },
  };
}

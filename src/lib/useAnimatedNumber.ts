import { useEffect, useRef, useState } from "react";

/**
 * Smoothly animates a number toward `target` with requestAnimationFrame and an
 * ease-out curve. Returns null while `target` is null (so callers can show a
 * skeleton). The FIRST real value animates over `first` ms (a count-up); later
 * changes ease over `rest` ms. No external animation library.
 */
export function useAnimatedNumber(
  target: number | null,
  { first = 800, rest = 400 }: { first?: number; rest?: number } = {},
): number | null {
  const [value, setValue] = useState<number | null>(target);
  const fromRef = useRef(0);
  const hasAnimatedRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (target == null) {
      setValue(null);
      return;
    }
    const from = fromRef.current;
    const to = target;
    const duration = hasAnimatedRef.current ? rest : first;
    hasAnimatedRef.current = true;

    if (from === to || duration <= 0) {
      fromRef.current = to;
      setValue(to);
      return;
    }

    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const current = from + (to - from) * eased;
      fromRef.current = current;
      setValue(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = to;
        setValue(to);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, first, rest]);

  return value;
}

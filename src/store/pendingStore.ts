// Tracks tweaks that are selected-but-not-applied on the Optimizer/Tweaks pages,
// so navigation can warn (and shake the pending-changes bar) before the user
// loses their selection by switching tabs. Purely local UI state — nothing here
// touches the system.
import { useEffect, useState } from "react";
import { create } from "zustand";

interface PendingState {
  /** How many tweaks are selected-but-not-applied on the current page. */
  count: number;
  /** Bumped to request a one-shot shake of the pending-changes bar. */
  shakeToken: number;
  setCount: (n: number) => void;
  shake: () => void;
}

export const usePendingStore = create<PendingState>((set) => ({
  count: 0,
  shakeToken: 0,
  setCount: (n) => set({ count: n }),
  shake: () => set((s) => ({ shakeToken: s.shakeToken + 1 })),
}));

/** True briefly each time a shake is requested — drives the one-shot `.shake`
 *  animation (which only plays on class add, so we toggle it off after it ends). */
export function useShakeSignal(): boolean {
  const token = usePendingStore((s) => s.shakeToken);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (token === 0) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), 420);
    return () => clearTimeout(t);
  }, [token]);
  return on;
}

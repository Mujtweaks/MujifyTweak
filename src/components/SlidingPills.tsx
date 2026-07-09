import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface Pill {
  id: string;
  label: ReactNode;
}

/**
 * Filter/tab pills with a single red background that SLIDES between the active
 * pill instead of teleporting (same technique as the sidebar indicator). Handles
 * wrapping rows, and respects prefers-reduced-motion via the shared CSS.
 */
export default function SlidingPills({
  pills,
  active,
  onChange,
}: {
  pills: Pill[];
  active: string;
  onChange: (id: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [ind, setInd] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const el = refs.current[active];
    if (el) setInd({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight });
  }, [active, pills.length]);

  return (
    <div ref={wrapRef} className="relative flex flex-wrap gap-2">
      {ind && (
        <span
          className="slide-indicator pointer-events-none absolute z-0 rounded-full bg-accent"
          style={{ left: ind.left, top: ind.top, width: ind.width, height: ind.height }}
        />
      )}
      {pills.map((p) => (
        <button
          key={p.id}
          ref={(el) => {
            refs.current[p.id] = el;
          }}
          onClick={() => onChange(p.id)}
          className={`relative z-10 rounded-full border px-4 py-1.5 text-[12px] font-medium transition-colors ${
            active === p.id ? "border-transparent text-white" : "border-edge bg-transparent text-txt2 hover:text-txt"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

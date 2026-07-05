interface ToggleProps {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
}

/** Custom red toggle switch — the core control on every tweak row. */
export default function Toggle({ on, onClick, disabled }: ToggleProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      role="switch"
      aria-checked={on}
      className={`relative flex h-[22px] w-[40px] shrink-0 items-center rounded-pill border transition-colors ${
        on ? "border-accent/50 bg-accent" : "border-edge2 bg-white/5"
      } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
    >
      <span
        className={`absolute h-[16px] w-[16px] rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-[20px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

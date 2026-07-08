interface ToggleProps {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
}

/** RIP-Tweaks-style toggle — red when on, no text labels. */
export default function Toggle({ on, onClick, disabled }: ToggleProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      role="switch"
      aria-checked={on}
      className={`relative flex h-[28px] w-[52px] shrink-0 items-center rounded-full border transition-colors duration-150 ease-out ${
        on ? "border-accent/60 bg-accent" : "border-edge2 bg-[#222]"
      } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
    >
      <span
        className={`absolute h-[22px] w-[22px] rounded-full bg-white shadow-md transition-transform duration-200 ease-[cubic-bezier(0.2,1.5,0.4,1)] ${
          on ? "translate-x-[25px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

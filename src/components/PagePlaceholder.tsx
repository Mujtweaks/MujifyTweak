import type { LucideIcon } from "lucide-react";

interface PagePlaceholderProps {
  icon: LucideIcon;
  title: string;
  milestone: string;
  description: string;
}

/** Branded stub for pages whose backend modules haven't landed yet. */
export default function PagePlaceholder({
  icon: Icon,
  title,
  milestone,
  description,
}: PagePlaceholderProps) {
  return (
    <div className="grid h-full place-items-center">
      <div className="max-w-sm text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-accent/10 shadow-[0_0_24px_rgba(227,0,14,0.2)]">
          <Icon size={24} strokeWidth={1.75} className="text-accent" />
        </span>
        <h1 className="font-display mt-4 text-2xl font-bold tracking-wide text-txt">
          {title}
        </h1>
        <span className="mt-2 inline-block rounded-md bg-accent/15 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-widest text-accent">
          {milestone}
        </span>
        <p className="mt-3 text-[13px] leading-relaxed text-txt2">{description}</p>
      </div>
    </div>
  );
}

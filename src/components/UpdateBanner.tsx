import { Download, X } from "lucide-react";

interface UpdateBannerProps {
  version: string;
  onUpdate: () => void;
  onDismiss: () => void;
}

/**
 * Non-intrusive update notice — wired to tauri-plugin-updater once the
 * GitHub Releases pipeline exists (end of v1.0). Never blocks the app.
 */
export default function UpdateBanner({ version, onUpdate, onDismiss }: UpdateBannerProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/10 px-3.5 py-2.5">
      <Download size={15} strokeWidth={2} className="shrink-0 text-accent" />
      <p className="min-w-0 flex-1 text-[12px] text-txt">
        Version {version} is available.
      </p>
      <button
        onClick={onUpdate}
        className="rounded-lg bg-accent px-3 py-1 text-[11.5px] font-semibold text-white transition-colors hover:bg-accent-hi"
      >
        Update Now
      </button>
      <button onClick={onDismiss} className="text-txt3 transition-colors hover:text-txt">
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

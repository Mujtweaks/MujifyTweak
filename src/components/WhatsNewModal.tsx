import { Sparkles, X } from "lucide-react";
import Markdown from "./Markdown";
import { DISCORD_INVITE, GITHUB_RELEASES, openExternal } from "../lib/links";

/**
 * "What's new" popup — shown once after the first launch on a new version, from
 * the GitHub release notes. If notes can't be fetched it simply never appears
 * (the caller skips it), so it's a graceful no-op while no releases exist.
 */
export default function WhatsNewModal({
  version,
  notes,
  loading = false,
  onClose,
}: {
  version: string;
  /** The release body for THIS build. null = it couldn't be fetched. */
  notes: string | null;
  loading?: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[65] grid place-items-center bg-black/75 p-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-card border border-edge bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-edge px-5 py-4">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-txt">
            <Sparkles size={15} className="text-accent" /> What's new in v{version}
          </h2>
          <button onClick={onClose} className="text-txt3 hover:text-txt" aria-label="Close">
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto px-5 py-4">
          {/* The notes are the GitHub release body, which is Markdown — rendering
              it as plain text showed readers literal "##" and "**". */}
          {loading ? (
            <p className="py-8 text-center text-[12.5px] text-txt3">Loading the notes for this build…</p>
          ) : notes ? (
            <Markdown text={notes} />
          ) : (
            // Honest empty state. Showing stale notes from another version — which
            // is what a hand-written local copy did — is worse than showing none.
            <div className="py-6 text-center">
              <p className="text-[12.5px] text-txt2">Couldn't load the notes for this build.</p>
              <p className="mt-1 text-[11.5px] text-txt3">You may be offline, or this build predates the current release.</p>
              <button
                onClick={() => void openExternal(GITHUB_RELEASES)}
                className="mt-3 rounded-btn border border-edge bg-card px-3.5 py-2 text-[12px] font-medium text-txt hover:border-edge2"
              >
                Open the releases page →
              </button>
            </div>
          )}
        </div>
        <div className="border-t border-edge px-5 py-3.5 text-center">
          <button
            onClick={() => void openExternal(DISCORD_INVITE)}
            className="text-[12px] font-semibold text-accent hover:text-accent-hi"
          >
            Join the Discord to shape the next update →
          </button>
        </div>
      </div>
    </div>
  );
}

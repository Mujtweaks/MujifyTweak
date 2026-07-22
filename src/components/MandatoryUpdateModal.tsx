import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { AlertTriangle, ArrowUpCircle, Cog, Sparkles } from "lucide-react";
import Markdown from "./Markdown";
import { fetchReleaseNotes, installUpdate } from "../lib/backend";
import { GITHUB_RELEASES, WEBSITE, openExternal } from "../lib/links";

/**
 * Required-update gate. Shown on launch whenever a newer signed release exists,
 * and it CANNOT be skipped — there is no close button and the backdrop doesn't
 * dismiss. The only way forward is to update.
 *
 * The one deliberate exception is a genuine install FAILURE: if the download or
 * install errors, we surface the real error and a Close button, so a broken
 * update server can never permanently lock a user out of a working app. That is
 * a safety valve, not a skip — nothing lets them dismiss a healthy update.
 */
export default function MandatoryUpdateModal({ version }: { version: string }) {
  const [phase, setPhase] = useState<"gate" | "installing" | "error">("gate");
  const [notes, setNotes] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const [downloaded, setDownloaded] = useState(0);
  const [total, setTotal] = useState(0);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pull the release notes so the gate can say what the update actually contains
  // — a forced update the user can't read is just an interruption.
  useEffect(() => {
    void fetchReleaseNotes(version).then(setNotes);
  }, [version]);

  const startUpdate = () => {
    setPhase("installing");
    setError(null);
    let dl = 0;
    const unsubs: Array<() => void> = [];
    void listen<{ chunk: number; total: number | null }>("update_progress", (e) => {
      dl += e.payload.chunk;
      setDownloaded(dl);
      if (e.payload.total) {
        setTotal(e.payload.total);
        setPct(Math.min(100, Math.round((dl / e.payload.total) * 100)));
      }
    }).then((u) => unsubs.push(u));
    void listen("update_installing", () => {
      setFinalizing(true);
      setPct(100);
    }).then((u) => unsubs.push(u));
    void installUpdate().catch((err) => {
      setError(String(err));
      setPhase("error");
      unsubs.forEach((u) => u());
    });
  };

  const mb = (b: number) => (b / 1_000_000).toFixed(1);

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/85 p-6 backdrop-blur-md">
      <div className="w-full max-w-md overflow-hidden rounded-card border border-edge bg-panel shadow-2xl">
        {phase === "gate" && (
          <>
            <div className="flex items-center gap-3 border-b border-edge px-6 py-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent/12 text-accent">
                <ArrowUpCircle size={24} strokeWidth={2} />
              </span>
              <div>
                <h2 className="text-[17px] font-bold text-txt">Update required</h2>
                <p className="text-[12px] text-txt2">Version {version} is ready. Update to keep using Mujify.</p>
              </div>
            </div>

            <div className="max-h-[42vh] overflow-y-auto px-6 py-4">
              <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-txt3">
                <Sparkles size={13} className="text-accent" /> What's in this update
              </p>
              {notes ? (
                <Markdown text={notes} />
              ) : (
                <p className="text-[12.5px] text-txt3">Fetching the release notes…</p>
              )}
            </div>

            <div className="border-t border-edge px-6 py-4">
              <button
                onClick={startUpdate}
                className="glint flex w-full items-center justify-center gap-2 rounded-btn bg-accent px-4 py-3 text-[13.5px] font-semibold text-white shadow-[0_4px_20px_rgba(227,0,14,0.3)] hover:bg-accent-hi"
              >
                <ArrowUpCircle size={16} strokeWidth={2.25} /> Update Now
              </button>
              <p className="mt-2.5 text-center text-[10.5px] text-txt3">
                Downloads and installs inside Mujify — nothing opens in your browser.
              </p>
            </div>
          </>
        )}

        {phase === "installing" && (
          <div className="px-6 py-12 text-center">
            {finalizing ? (
              <>
                <span className="relative mx-auto grid h-16 w-16 place-items-center">
                  <span className="glow-pulse absolute inset-0 rounded-full bg-accent/30 blur-xl" />
                  <Cog size={44} className="spin-slow relative text-accent" />
                </span>
                <h2 className="mt-4 text-[17px] font-bold text-txt">Installing update</h2>
                <p className="mt-1.5 text-[12.5px] text-txt2">Mujify will restart automatically in a moment.</p>
              </>
            ) : (
              <>
                <h2 className="text-[17px] font-bold text-txt">Downloading version {version}</h2>
                <p className="mt-1 text-[12px] text-txt3">Verified before it installs.</p>
                <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-bg">
                  <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-2 text-[12px] text-txt2">
                  {pct}%{total > 0 ? ` · ${mb(downloaded)} / ${mb(total)} MB` : ""}
                </p>
              </>
            )}
          </div>
        )}

        {phase === "error" && (
          <div className="px-6 py-8 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-warning/12 text-warning">
              <AlertTriangle size={26} strokeWidth={2} />
            </span>
            <h2 className="mt-3 text-[17px] font-bold text-txt">Update couldn't finish</h2>
            <p className="mt-2 text-[12.5px] leading-relaxed text-txt2">
              Your current version still works. Try again, or download the update from the website.
            </p>
            <p className="mt-3 break-words rounded-chip border border-edge bg-bg px-3 py-2 text-left text-[11px] text-txt3">
              {error}
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                onClick={startUpdate}
                className="rounded-btn bg-accent px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-accent-hi"
              >
                Try again
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => void openExternal(GITHUB_RELEASES)}
                  className="flex-1 rounded-btn border border-edge bg-card px-4 py-2 text-[12.5px] font-medium text-txt hover:border-edge2"
                >
                  Download page
                </button>
                {/* Safety valve: only reachable AFTER a real failure, never a skip
                    for a healthy update. Lets a broken update server not brick the app. */}
                <button
                  onClick={() => void openExternal(WEBSITE)}
                  className="flex-1 rounded-btn border border-edge bg-card px-4 py-2 text-[12.5px] font-medium text-txt2 hover:text-txt"
                >
                  Website
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

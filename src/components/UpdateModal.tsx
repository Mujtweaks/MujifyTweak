import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Cog } from "lucide-react";
import { installUpdate } from "../lib/backend";

/**
 * In-app update flow — download with a real progress bar, then an "Installing…"
 * state (rotating gear + red glow) before the app relaunches itself. It NEVER
 * opens a browser page; everything happens in-window.
 */
export default function UpdateModal({ version, onClose }: { version: string; onClose: () => void }) {
  const [pct, setPct] = useState(0);
  const [downloaded, setDownloaded] = useState(0);
  const [total, setTotal] = useState(0);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
      setInstalling(true);
      setPct(100);
    }).then((u) => unsubs.push(u));
    void installUpdate().catch((err) => setError(String(err)));
    return () => unsubs.forEach((u) => u());
  }, []);

  const mb = (b: number) => (b / 1_000_000).toFixed(1);

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/80 p-6 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-card border border-edge bg-panel p-7 text-center shadow-2xl">
        {error ? (
          <>
            <h2 className="text-[17px] font-bold text-txt">Update failed</h2>
            <p className="mt-2 text-[12.5px] leading-relaxed text-txt2">{error}</p>
            <button onClick={onClose} className="mt-5 rounded-btn border border-edge bg-card px-5 py-2 text-[13px] text-txt2 hover:text-txt">
              Close
            </button>
          </>
        ) : installing ? (
          <>
            <span className="relative mx-auto grid h-16 w-16 place-items-center">
              <span className="glow-pulse absolute inset-0 rounded-full bg-accent/30 blur-xl" />
              <Cog size={44} className="spin-slow relative text-accent" />
            </span>
            <h2 className="mt-4 text-[17px] font-bold text-txt">Installing update…</h2>
            <p className="mt-1.5 text-[12.5px] text-txt2">Mujify will restart automatically in a moment.</p>
          </>
        ) : (
          <>
            <h2 className="text-[17px] font-bold text-txt">Updating to v{version}</h2>
            <p className="mt-1 text-[12px] text-txt3">Downloading in-app — nothing opens in your browser.</p>
            <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-bg">
              <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-[12px] text-txt2">
              {pct}%{total > 0 ? ` · ${mb(downloaded)} / ${mb(total)} MB` : ""}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

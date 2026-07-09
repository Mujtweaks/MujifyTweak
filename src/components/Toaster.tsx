import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useToastStore, type ToastType } from "../store/toastStore";

// Per-type icon + color (success green, warning yellow, error red, info grey).
const STYLE: Record<ToastType, { icon: typeof Info; ring: string; text: string }> = {
  success: { icon: CheckCircle2, ring: "border-success/30 bg-success/10", text: "text-success" },
  warning: { icon: AlertTriangle, ring: "border-warning/30 bg-warning/10", text: "text-warning" },
  error: { icon: XCircle, ring: "border-accent/30 bg-accent/10", text: "text-accent" },
  info: { icon: Info, ring: "border-edge2 bg-panel2", text: "text-txt2" },
};

/**
 * Bottom-right toast stack. Mounted once in App; reads the global toast store.
 * Toasts slide in from the right, stack vertically, and fade out on dismiss.
 */
export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[340px] flex-col gap-2.5">
      {toasts.map((t) => {
        const s = STYLE[t.type];
        const Icon = s.icon;
        return (
          <div
            key={t.id}
            className={`${t.leaving ? "toast-out" : "toast-in"} pointer-events-auto flex items-start gap-3 rounded-xl border border-edge bg-card/95 p-3 shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur`}
          >
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${s.ring}`}>
              <Icon size={16} strokeWidth={2} className={s.text} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[13px] font-semibold leading-tight text-txt">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 text-[11.5px] leading-snug text-txt2">{t.description}</p>
              )}
              {t.action && (
                <button
                  onClick={() => {
                    window.location.hash = t.action!.navigateTo;
                    dismiss(t.id);
                  }}
                  className="mt-1.5 text-[11.5px] font-semibold text-accent hover:text-accent-hi"
                >
                  {t.action.label} →
                </button>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded p-0.5 text-txt3 transition-colors hover:text-txt"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

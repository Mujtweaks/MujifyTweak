// src/store/toastStore.ts
//
// Lightweight global toast system. The `toast` helper below is a plain object
// (no hooks), so any component, store, or lib wrapper can fire a notification
// without prop drilling: `toast.success("Saved")`. The <Toaster/> component
// subscribes to this store and renders the stack.
import { create } from "zustand";

export type ToastType = "success" | "warning" | "error" | "info";

/** Optional action link on a toast — navigates to a page via the hash router. */
export interface ToastAction {
  label: string;
  navigateTo: string;
}

export interface Toast {
  id: number;
  type: ToastType;
  title: string;
  description?: string;
  action?: ToastAction;
  /** Set briefly before removal so the Toaster can play the exit animation. */
  leaving?: boolean;
}

interface ToastState {
  toasts: Toast[];
  push: (t: { type: ToastType; title: string; description?: string; action?: ToastAction }) => void;
  dismiss: (id: number) => void;
}

const VISIBLE_MS = 3000; // time on screen before auto-dismiss
const EXIT_MS = 280; // must match the .toast-out animation duration

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push: ({ type, title, description, action }) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, type, title, description, action }] }));
    setTimeout(() => get().dismiss(id), VISIBLE_MS);
  },

  dismiss: (id) => {
    // Flag as leaving (exit animation), then actually remove after it plays.
    set((s) => ({
      toasts: s.toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
    }));
    setTimeout(
      () => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      EXIT_MS,
    );
  },
}));

/** Fire-and-forget toast API — callable from anywhere, no hooks required. */
export const toast = {
  success: (title: string, description?: string) =>
    useToastStore.getState().push({ type: "success", title, description }),
  warning: (title: string, description?: string) =>
    useToastStore.getState().push({ type: "warning", title, description }),
  error: (title: string, description?: string, action?: ToastAction) =>
    useToastStore.getState().push({ type: "error", title, description, action }),
  info: (title: string, description?: string) =>
    useToastStore.getState().push({ type: "info", title, description }),
  /** An error toast that offers free human help (opens the Support hub). */
  errorHelp: (title: string, description?: string) =>
    useToastStore
      .getState()
      .push({ type: "error", title, description, action: { label: "Get free help", navigateTo: "support" } }),
};

// src/store/aiStore.ts
//
// Chat state lives here, not in the AIAssistant component, so switching tabs
// (which unmounts the page) never destroys the conversation. Every mutation
// also persists the full history to disk via the Rust `save_ai_session` command
// so it survives an app restart too.
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../lib/tauri";

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface AiState {
  messages: AiMessage[];
  isLoading: boolean;
  streamingContent: string; // live streaming text for the current AI response

  pushMessage: (msg: AiMessage) => void;
  setLoading: (v: boolean) => void;
  // Accepts a value or an updater, mirroring React's setState — the chunk
  // listener appends with `(prev) => prev + delta`.
  setStreamingContent: (v: string | ((prev: string) => string)) => void;
  finalizeStreaming: () => void; // commit streamingContent as a real assistant message
  clearMessages: () => void;
  loadPersistedSession: () => Promise<void>;
  persistSession: () => Promise<void>;
}

export const useAiStore = create<AiState>((set, get) => ({
  messages: [],
  isLoading: false,
  streamingContent: "",

  pushMessage: (msg) => {
    set((s) => ({ messages: [...s.messages, msg] }));
    void get().persistSession();
  },

  setLoading: (v) => set({ isLoading: v }),

  setStreamingContent: (v) =>
    set((s) => ({
      streamingContent: typeof v === "function" ? v(s.streamingContent) : v,
    })),

  finalizeStreaming: () => {
    const content = get().streamingContent;
    // Empty response: don't commit a blank bubble, but still clear the loading
    // state so the UI never gets stuck on the typing indicator.
    if (!content.trim()) {
      set({ streamingContent: "", isLoading: false });
      return;
    }
    set((s) => ({
      messages: [...s.messages, { role: "assistant", content, timestamp: Date.now() }],
      streamingContent: "",
      isLoading: false,
    }));
    void get().persistSession();
  },

  clearMessages: () => {
    set({ messages: [], streamingContent: "", isLoading: false });
    void get().persistSession();
  },

  loadPersistedSession: async () => {
    if (!isTauri) return;
    try {
      const saved = await invoke<AiMessage[] | null>("load_ai_session");
      if (saved && saved.length > 0) set({ messages: saved });
    } catch {
      /* first launch, no session yet */
    }
  },

  persistSession: async () => {
    if (!isTauri) return;
    try {
      await invoke("save_ai_session", { messages: get().messages });
    } catch {
      /* non-fatal */
    }
  },
}));

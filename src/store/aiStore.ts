import { create } from "zustand";

interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

interface AiState {
  messages: AiMessage[];
  /** True once a NIM API key is saved in Settings (Phase 4 / v2.5). */
  apiKeyConfigured: boolean;

  pushMessage: (msg: AiMessage) => void;
  setApiKeyConfigured: (configured: boolean) => void;
}

export const useAiStore = create<AiState>((set) => ({
  messages: [],
  apiKeyConfigured: false,

  pushMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setApiKeyConfigured: (apiKeyConfigured) => set({ apiKeyConfigured }),
}));

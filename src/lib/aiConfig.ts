/**
 * AI Assistant credentials — provided by the app owner so end users never need
 * their own key. These are embedded intentionally (owner's decision). A user
 * can still override them in Settings (stored in localStorage), which takes
 * precedence when present.
 */

const EMBEDDED_NVIDIA_KEY =
  "nvapi-REDACTED";
const EMBEDDED_TAVILY_KEY = "tvly-REDACTED";

export const NEMOTRON_MODEL = "nvidia/nemotron-3-ultra-550b-a55b";
export const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";

/** Effective NVIDIA key — user override (Settings) wins, else the embedded one. */
export function nvidiaKey(): string {
  return localStorage.getItem("mujify_nvidia_key")?.trim() || EMBEDDED_NVIDIA_KEY;
}

/** Effective Tavily key — user override wins, else the embedded one. */
export function tavilyKey(): string {
  return localStorage.getItem("mujify_tavily_key")?.trim() || EMBEDDED_TAVILY_KEY;
}

/** The AI is always usable out of the box — keys ship with the app. */
export const aiReady = true;

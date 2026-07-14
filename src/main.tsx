import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import OverlayView from "./pages/OverlayView";
import "./index.css";

// The transparent, click-through overlay window loads this same bundle at
// #overlay — mount ONLY the tiny live-stats panel there, never the full shell.
const isOverlay = window.location.hash.replace(/^#/, "") === "overlay";

// CRITICAL for the overlay: the app's body has a solid dark background, which
// would make the overlay a black box instead of see-through. Clear it (and #root)
// synchronously BEFORE the first paint so the window is transparent from frame 1.
if (isOverlay) {
  const clear = (el: HTMLElement | null) => { if (el) el.style.background = "transparent"; };
  clear(document.documentElement);
  clear(document.body);
  clear(document.getElementById("root"));
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isOverlay ? <OverlayView /> : <App />}</React.StrictMode>,
);

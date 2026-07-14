import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import OverlayView from "./pages/OverlayView";
import "./index.css";

// The transparent, click-through overlay window loads this same bundle at
// #overlay — mount ONLY the tiny live-stats panel there, never the full shell.
const isOverlay = window.location.hash.replace(/^#/, "") === "overlay";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isOverlay ? <OverlayView /> : <App />}</React.StrictMode>,
);

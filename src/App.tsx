import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import GamesBar from "./components/GamesBar";
import Dashboard from "./pages/Dashboard";
import Optimizer from "./pages/Optimizer";
import Profiles from "./pages/Profiles";
import ProfileEditor from "./pages/ProfileEditor";
import Diagnostics from "./pages/Diagnostics";
import Network from "./pages/Network";
import Tweaks from "./pages/Tweaks";
import Fixes from "./pages/Fixes";
import Tools from "./pages/Tools";
import AIAssistant from "./pages/AIAssistant";
import ChangeLogView from "./pages/ChangeLogView";
import ReportView from "./pages/ReportView";
import History from "./pages/History";
import DriverManager from "./pages/DriverManager";
import StartupManager from "./pages/StartupManager";
import Settings from "./pages/Settings";
import Toaster from "./components/Toaster";
import { checkResetTweaks, connectBackend, fetchHardware } from "./lib/backend";
import { toast } from "./store/toastStore";
import { initEventBridge, listenNavigate } from "./lib/events";
import { NAV_ITEMS, type PageId } from "./lib/nav";

const VALID_PAGES = new Set<string>([...NAV_ITEMS.map((n) => n.id), "changelog", "report"]);

function pageFromHash(): PageId | null {
  const h = window.location.hash.replace(/^#/, "");
  return VALID_PAGES.has(h) ? (h as PageId) : null;
}

export default function App() {
  const [page, setPage] = useState<PageId>(() => pageFromHash() ?? "home");

  useEffect(() => {
    void connectBackend();
    void fetchHardware();
    void initEventBridge();
    // Windows feature updates can silently reset tweaks — re-detect on launch
    // and let the user re-apply the ones that drifted back to default.
    void checkResetTweaks().then((ids) => {
      if (ids.length > 0) {
        toast.info(
          `${ids.length} tweak${ids.length === 1 ? "" : "s"} were reset by Windows`,
          "Re-apply them from the Tweaks tab.",
        );
      }
    });
    // Tray deep-links (e.g. Quick Optimize) navigate the UI.
    let unlisten: (() => void) | undefined;
    listenNavigate((p) => {
      if (VALID_PAGES.has(p)) setPage(p as PageId);
    }).then((u) => (unlisten = u));
    // Hash deep-links (#network, #optimizer, …).
    const onHash = () => {
      const p = pageFromHash();
      if (p) setPage(p);
    };
    window.addEventListener("hashchange", onHash);
    return () => {
      unlisten?.();
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  const renderPage = () => {
    switch (page) {
      case "home":
        return <Dashboard onNavigate={setPage} />;
      case "optimizer":
        return <Optimizer onNavigate={setPage} />;
      case "profiles":
        return <Profiles onNavigate={setPage} />;
      case "profile-editor":
        return <ProfileEditor />;
      case "diagnostics":
        return <Diagnostics />;
      case "network":
        return <Network />;
      case "tweaks":
        return <Tweaks />;
      case "fixes":
        return <Fixes />;
      case "tools":
        return <Tools />;
      case "ai":
        return <AIAssistant onNavigate={setPage} />;
      case "changelog":
        return <ChangeLogView />;
      case "report":
        return <ReportView />;
      case "history":
        return <History />;
      case "drivers":
        return <DriverManager />;
      case "startup":
        return <StartupManager />;
      case "settings":
        return <Settings />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg text-txt">
      <Sidebar page={page} onNavigate={setPage} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar page={page} onNavigate={setPage} />
        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div key={page} className="page-enter">
            {renderPage()}
          </div>
        </main>
        <GamesBar onNavigate={setPage} />
      </div>
      <Toaster />
    </div>
  );
}

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
import Tools from "./pages/Tools";
import AIAssistant from "./pages/AIAssistant";
import ChangeLogView from "./pages/ChangeLogView";
import ReportView from "./pages/ReportView";
import History from "./pages/History";
import DriverManager from "./pages/DriverManager";
import StartupManager from "./pages/StartupManager";
import Settings from "./pages/Settings";
import { connectBackend, fetchHardware } from "./lib/backend";
import { initEventBridge, listenNavigate } from "./lib/events";
import { NAV_ITEMS, type PageId } from "./lib/nav";

export default function App() {
  const [page, setPage] = useState<PageId>("home");

  useEffect(() => {
    void connectBackend();
    void fetchHardware();
    void initEventBridge();
    // Tray deep-links (e.g. Quick Optimize) navigate the UI.
    const valid = new Set<string>([...NAV_ITEMS.map((n) => n.id), "changelog", "report"]);
    let unlisten: (() => void) | undefined;
    listenNavigate((p) => {
      if (valid.has(p)) setPage(p as PageId);
    }).then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);

  const renderPage = () => {
    switch (page) {
      case "home":
        return <Dashboard onNavigate={setPage} />;
      case "optimizer":
        return <Optimizer onNavigate={setPage} />;
      case "profiles":
        return <Profiles />;
      case "profile-editor":
        return <ProfileEditor />;
      case "diagnostics":
        return <Diagnostics />;
      case "network":
        return <Network />;
      case "tweaks":
        return <Tweaks />;
      case "tools":
        return <Tools />;
      case "ai":
        return <AIAssistant />;
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
        <TopBar onNavigate={setPage} />
        <main className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {renderPage()}
        </main>
        <GamesBar />
      </div>
    </div>
  );
}

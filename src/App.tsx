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
import Cleaner from "./pages/Cleaner";
import Tools from "./pages/Tools";
import AIAssistant from "./pages/AIAssistant";
import ChangeLogView from "./pages/ChangeLogView";
import ReportView from "./pages/ReportView";
import History from "./pages/History";
import DriverManager from "./pages/DriverManager";
import StartupManager from "./pages/StartupManager";
import Support from "./pages/Support";
import Settings from "./pages/Settings";
import Toaster from "./components/Toaster";
import SplashIntro from "./components/SplashIntro";
import WelcomeModal from "./components/WelcomeModal";
import WhatsNewModal from "./components/WhatsNewModal";
import ReadyCheck from "./components/ReadyCheck";
import { checkResetTweaks, connectBackend, fetchHardware, fetchReleaseNotes, getAppVersion } from "./lib/backend";
import { toast } from "./store/toastStore";
import { startHeartbeat } from "./lib/heartbeat";
import { initEventBridge, listenNavigate } from "./lib/events";
import { NAV_ITEMS, type PageId } from "./lib/nav";

const VALID_PAGES = new Set<string>([...NAV_ITEMS.map((n) => n.id), "changelog", "report", "support"]);

function pageFromHash(): PageId | null {
  const h = window.location.hash.replace(/^#/, "");
  return VALID_PAGES.has(h) ? (h as PageId) : null;
}

export default function App() {
  const [page, setPage] = useState<PageId>(() => pageFromHash() ?? "home");
  // Cinematic logo splash on launch — an overlay, so the app keeps loading
  // underneath and startup is never delayed. Click to skip.
  const [splash, setSplash] = useState(true);
  // First-run welcome — shown once, then never again (persisted flag).
  const [showWelcome, setShowWelcome] = useState(() => {
    try {
      return !localStorage.getItem("mujify.welcomed");
    } catch {
      return false;
    }
  });
  const dismissWelcome = () => {
    try {
      localStorage.setItem("mujify.welcomed", "1");
    } catch {
      /* ignore storage errors — worst case the welcome shows again next launch */
    }
    setShowWelcome(false);
  };
  // "What's new" — shown once after the first launch on a new version.
  const [whatsNew, setWhatsNew] = useState<{ version: string; notes: string } | null>(null);

  useEffect(() => {
    void connectBackend();
    void fetchHardware();
    void initEventBridge();
    // Opt-in anonymous online ping (no-ops unless enabled + endpoint configured).
    startHeartbeat();
    // "What's new" popup once per new version (graceful no-op if notes 404).
    void (async () => {
      const current = await getAppVersion();
      if (!current) return;
      try {
        const last = localStorage.getItem("mujify.lastVersion");
        if (last && last !== current) {
          const notes = await fetchReleaseNotes(current);
          if (notes) setWhatsNew({ version: current, notes });
        }
        localStorage.setItem("mujify.lastVersion", current);
      } catch {
        /* ignore storage errors */
      }
    })();
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
      case "cleaner":
        return <Cleaner />;
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
      case "support":
        return <Support onNavigate={setPage} />;
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
      <ReadyCheck onNavigate={setPage} />
      {splash && <SplashIntro onDone={() => setSplash(false)} />}
      {!splash && showWelcome && <WelcomeModal onClose={dismissWelcome} />}
      {whatsNew && (
        <WhatsNewModal version={whatsNew.version} notes={whatsNew.notes} onClose={() => setWhatsNew(null)} />
      )}
    </div>
  );
}

import { History as HistoryIcon } from "lucide-react";
import PagePlaceholder from "../components/PagePlaceholder";

export default function History() {
  return (
    <PagePlaceholder
      icon={HistoryIcon}
      title="History"
      milestone="v3.5"
      description="FPS trends across sessions per game — spot a driver regression or thermal decline over weeks. No other free optimizer tracks this."
    />
  );
}

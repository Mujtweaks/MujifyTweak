import { Sparkles } from "lucide-react";
import PagePlaceholder from "../components/PagePlaceholder";

export default function AIAssistant() {
  return (
    <PagePlaceholder
      icon={Sparkles}
      title="AI Assistant"
      milestone="v2.5 · NVIDIA Nemotron"
      description="Describe a problem in plain English — the AI scans your PC, proposes risk-labeled fixes with exact previews, and every applied fix gets an undo card. Powered by nvidia/nemotron-3-super-120b-a12b."
    />
  );
}

import { PencilRuler } from "lucide-react";
import PagePlaceholder from "../components/PagePlaceholder";

export default function ProfileEditor() {
  return (
    <PagePlaceholder
      icon={PencilRuler}
      title="Profile Editor"
      milestone="Checkpoint 11"
      description="Edit every tweak in a game's profile — kill list, power plan, GPU low-latency, network QoS — each with a clear risk label."
    />
  );
}

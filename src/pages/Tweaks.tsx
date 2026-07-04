import { SlidersHorizontal } from "lucide-react";
import PagePlaceholder from "../components/PagePlaceholder";

export default function Tweaks() {
  return (
    <PagePlaceholder
      icon={SlidersHorizontal}
      title="Tweaks"
      milestone="Checkpoint 9 → v2.0"
      description="Safe tweaks first (power plan, Game Bar, standby memory), advanced kernel-level tweaks later — every one opt-in, risk-labeled and fully reversible."
    />
  );
}

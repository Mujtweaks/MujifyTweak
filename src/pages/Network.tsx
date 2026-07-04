import { Globe } from "lucide-react";
import PagePlaceholder from "../components/PagePlaceholder";

export default function Network() {
  return (
    <PagePlaceholder
      icon={Globe}
      title="Network"
      milestone="Checkpoint 7"
      description="Live ping, jitter and throughput from real ICMP probes and adapter counters — plus QoS and latency tweaks in later phases."
    />
  );
}

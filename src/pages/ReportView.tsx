import { LineChart } from "lucide-react";
import PagePlaceholder from "../components/PagePlaceholder";

export default function ReportView() {
  return (
    <PagePlaceholder
      icon={LineChart}
      title="Before/After Report"
      milestone="Checkpoints 13–15"
      description="A 60-second baseline before tweaks, the identical benchmark after, and an honest delta — including when the answer is 'no significant change'. No proof, no claim."
    />
  );
}

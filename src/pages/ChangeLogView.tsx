import { ListChecks } from "lucide-react";
import PagePlaceholder from "../components/PagePlaceholder";

export default function ChangeLogView() {
  return (
    <PagePlaceholder
      icon={ListChecks}
      title="Change Log"
      milestone="Checkpoint 9"
      description="Every single change Mujify makes, in plain English, with before/after values — undoable one at a time or all at once. Nothing is ever hidden."
    />
  );
}

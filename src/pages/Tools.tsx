import { Wrench } from "lucide-react";
import PagePlaceholder from "../components/PagePlaceholder";

export default function Tools() {
  return (
    <PagePlaceholder
      icon={Wrench}
      title="Tools"
      milestone="v3.5"
      description="RAM cleaner, disk junk cleaner, hardware health monitor, in-game overlay and game server ping tester — advanced extras, all free."
    />
  );
}

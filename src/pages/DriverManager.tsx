import { CircuitBoard } from "lucide-react";
import PagePlaceholder from "../components/PagePlaceholder";

export default function DriverManager() {
  return (
    <PagePlaceholder
      icon={CircuitBoard}
      title="Driver Manager"
      milestone="v1.5"
      description="Detects known-bad GPU driver versions, checks HAGS and Resizable BAR status, and links you straight to the right download."
    />
  );
}

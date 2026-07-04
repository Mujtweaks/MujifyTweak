import { ListTodo } from "lucide-react";
import PagePlaceholder from "../components/PagePlaceholder";

export default function StartupManager() {
  return (
    <PagePlaceholder
      icon={ListTodo}
      title="Startup Manager"
      milestone="v3.5"
      description="Everything that runs at Windows startup with safety ratings and impact estimates — one-click disable, instant undo."
    />
  );
}

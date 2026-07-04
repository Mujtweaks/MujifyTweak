import { RotateCcw } from "lucide-react";
import RiskLabel from "./RiskLabel";
import type { RiskLevel } from "../lib/types";

interface UndoCardProps {
  description: string;
  risk: RiskLevel;
  timestamp: number;
  undone: boolean;
  onUndo: () => void;
}

/**
 * Per-action undo card — rendered in ChangeLogView (Checkpoint 9+) and later
 * inline in AI chat (v2.5). Calls revert_single on the RollbackEngine.
 */
export default function UndoCard({
  description,
  risk,
  timestamp,
  undone,
  onUndo,
}: UndoCardProps) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border border-edge bg-panel px-3.5 py-2.5 ${
        undone ? "opacity-50" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className={`text-[12.5px] text-txt ${undone ? "line-through" : ""}`}>
          {description}
        </p>
        <p className="mt-0.5 text-[10.5px] text-txt3">
          {new Date(timestamp).toLocaleTimeString()}
        </p>
      </div>
      <RiskLabel level={risk} />
      <button
        onClick={onUndo}
        disabled={undone}
        className="flex items-center gap-1.5 rounded-lg border border-edge bg-panel2 px-2.5 py-1.5 text-[11.5px] font-medium text-txt transition-colors hover:border-edge2 disabled:cursor-not-allowed disabled:text-txt3"
      >
        <RotateCcw size={12} strokeWidth={2} />
        {undone ? "Undone" : "Undo"}
      </button>
    </div>
  );
}

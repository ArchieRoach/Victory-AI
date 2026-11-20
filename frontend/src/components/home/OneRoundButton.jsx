import { useNavigate } from "react-router-dom";
import { Timer } from "lucide-react";
import { tx } from "@/i18n/tx";

// Fogg: when ability is low (tired, busy), make the action smaller, not the push louder.
export function OneRoundButton() {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate("/train?quick=1")} data-testid="one-round"
      className="victory-btn-primary flex items-center justify-center gap-2">
      <Timer className="w-5 h-5" /> {tx("ui.oneRoundButton.justOneRound3", "Just one round · 3 min")}
    </button>
  );
}

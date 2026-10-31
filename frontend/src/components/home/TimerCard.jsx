import { useNavigate } from "react-router-dom";
import { Timer, ChevronRight } from "lucide-react";

// The way into the workout timer (reasoning in backend/workouts.py): bag, pads, circuits and HIIT
// with the camera on the same screen.
export function TimerCard() {
  const navigate = useNavigate();
  return (
    <button className="victory-card p-4 w-full flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
      onClick={() => navigate("/timer")} data-testid="timer-card">
      <div className="w-11 h-11 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center flex-shrink-0">
        <Timer className="w-5 h-5 text-victory-lime" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-victory-text font-semibold">Timer & circuits</p>
        <p className="text-victory-muted text-xs">Bag, pads, circuits, HIIT. Film it on the same screen.</p>
      </div>
      <ChevronRight className="w-5 h-5 text-victory-muted" />
    </button>
  );
}

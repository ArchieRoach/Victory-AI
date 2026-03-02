import { ChevronRight } from "lucide-react";

export const SessionCard = ({ session, onClick }) => {
  const date = new Date(session.date);
  const formattedDate = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  // Create mini radar data
  const scores = session.dimension_scores
    .filter((d) => d.score !== null)
    .map((d) => d.score);

  return (
    <button
      onClick={onClick}
      className="victory-card p-4 w-full flex items-center gap-4 transition-colors hover:bg-victory-card-highlight"
      data-testid={`session-card-${session.session_id}`}
    >
      {/* Mini Radar */}
      <div className="w-12 h-12 flex-shrink-0">
        <svg viewBox="0 0 48 48" className="w-full h-full">
          <circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            stroke="#2A2A3A"
            strokeWidth="1"
          />
          <circle
            cx="24"
            cy="24"
            r="12"
            fill="none"
            stroke="#2A2A3A"
            strokeWidth="1"
          />
          {/* Simplified radar shape */}
          <polygon
            points={session.dimension_scores
              .slice(0, 8)
              .map((d, i) => {
                const angle = (i * 45 - 90) * (Math.PI / 180);
                const r = ((d.score || 0) / 10) * 18;
                return `${24 + r * Math.cos(angle)},${24 + r * Math.sin(angle)}`;
              })
              .join(" ")}
            fill="#E8FF47"
            fillOpacity="0.3"
            stroke="#E8FF47"
            strokeWidth="1"
          />
        </svg>
      </div>

      {/* Session Info */}
      <div className="flex-1 text-left">
        <p className="text-victory-text font-medium">{formattedDate}</p>
        <p className="text-victory-muted text-sm">
          Overall: {session.overall_score.toFixed(1)}/10
        </p>
      </div>

      {/* Arrow */}
      <ChevronRight className="w-5 h-5 text-victory-muted" />
    </button>
  );
};

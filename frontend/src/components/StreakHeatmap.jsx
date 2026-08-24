import { format } from "date-fns";

// Strava-style 7-day activity strip — each dot is a real logged session, not an app-open.
export function StreakHeatmap({ days }) {
  if (!days?.length) return null;
  const todayStr = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="flex items-center justify-between gap-1.5">
      {days.map((day) => {
        const isToday = day.date === todayStr;
        return (
          <div key={day.date} className="flex flex-col items-center gap-1">
            <div
              className={`w-6 h-6 rounded-full flex-shrink-0 ${
                day.active
                  ? "bg-orange-400"
                  : "bg-victory-card-highlight border border-victory-border"
              } ${isToday ? "ring-2 ring-offset-2 ring-offset-victory-bg ring-orange-400/60" : ""}`}
            />
            <span className="text-[10px] text-victory-muted uppercase">
              {format(new Date(`${day.date}T00:00:00`), "EEEEE")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

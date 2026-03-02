import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export const ProgressChart = ({ sessions }) => {
  const data = useMemo(() => {
    // Sort by date ascending and take last 10 sessions
    const sorted = [...sessions]
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(-10);

    return sorted.map((session, index) => ({
      name: new Date(session.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      score: session.overall_score,
      fullDate: new Date(session.date).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      sessionNumber: index + 1,
    }));
  }, [sessions]);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-victory-card border border-victory-border rounded-lg px-3 py-2">
          <p className="text-victory-text font-medium">{data.fullDate}</p>
          <p className="text-victory-lime font-mono">
            {data.score.toFixed(1)}/10
          </p>
        </div>
      );
    }
    return null;
  };

  if (sessions.length === 1) {
    return (
      <div className="h-32 flex flex-col items-center justify-center">
        <div className="w-4 h-4 rounded-full bg-victory-lime mb-2" />
        <p className="text-victory-muted text-sm">
          Session 1 — your baseline
        </p>
        <p className="text-victory-lime font-mono text-lg">
          {sessions[0].overall_score.toFixed(1)}/10
        </p>
      </div>
    );
  }

  return (
    <div data-testid="progress-chart">
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#8888A0", fontSize: 11 }}
          />
          <YAxis
            domain={[0, 10]}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#8888A0", fontSize: 11 }}
            ticks={[0, 5, 10]}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#E8FF47"
            strokeWidth={2}
            dot={{ fill: "#E8FF47", r: 4, strokeWidth: 0 }}
            activeDot={{ r: 6, fill: "#E8FF47" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

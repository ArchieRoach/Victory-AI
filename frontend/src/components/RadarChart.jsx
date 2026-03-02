import { useMemo } from "react";
import {
  Radar,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";

const DIMENSIONS = [
  "Jab",
  "Cross",
  "Left Hook",
  "Right Hook",
  "Uppercut",
  "Guard Position",
  "Head Movement",
  "Footwork",
  "Slip",
  "Roll",
  "Parry",
  "Body Movement",
  "Combination Flow",
  "Ring Generalship",
  "Punch Balance",
  "Punch Accuracy",
];

export const RadarChart = ({
  currentScores,
  previousScores,
  overallScore,
  onDimensionClick,
}) => {
  const data = useMemo(() => {
    return DIMENSIONS.map((dim) => {
      const current = currentScores?.find((s) => s.dimension_name === dim);
      const previous = previousScores?.find((s) => s.dimension_name === dim);

      return {
        dimension: dim,
        // Shortened labels for mobile
        shortLabel:
          dim.length > 10 ? dim.split(" ")[0].substring(0, 8) : dim.substring(0, 8),
        current: current?.score || 0,
        previous: previous?.score || 0,
        fullMark: 10,
      };
    });
  }, [currentScores, previousScores]);

  const handleClick = (data) => {
    if (onDimensionClick && data?.dimension) {
      onDimensionClick(data.dimension);
    }
  };

  return (
    <div className="relative" data-testid="radar-chart">
      <ResponsiveContainer width="100%" height={300}>
        <RechartsRadarChart
          cx="50%"
          cy="50%"
          outerRadius="70%"
          data={data}
          onClick={(e) => e?.activePayload?.[0]?.payload && handleClick(e.activePayload[0].payload)}
        >
          <PolarGrid stroke="#2A2A3A" strokeWidth={1} />
          <PolarAngleAxis
            dataKey="shortLabel"
            tick={{ fill: "#8888A0", fontSize: 10 }}
            tickLine={false}
          />

          {/* Previous session (ghost) */}
          {previousScores && previousScores.length > 0 && (
            <Radar
              name="Previous"
              dataKey="previous"
              stroke="#47E8C8"
              strokeWidth={1}
              fill="#47E8C8"
              fillOpacity={0.1}
              dot={false}
            />
          )}

          {/* Current session */}
          <Radar
            name="Current"
            dataKey="current"
            stroke="#E8FF47"
            strokeWidth={2}
            fill="#E8FF47"
            fillOpacity={0.3}
            dot={{ fill: "#E8FF47", r: 3 }}
          />
        </RechartsRadarChart>
      </ResponsiveContainer>

      {/* Center Score */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <span className="radar-center-score text-4xl text-victory-lime">
            {overallScore?.toFixed(1) || "—"}
          </span>
          <span className="text-victory-muted text-sm block">/10</span>
        </div>
      </div>
    </div>
  );
};

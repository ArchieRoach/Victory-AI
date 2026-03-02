import { useState, useEffect } from "react";
import axios from "axios";
import { API } from "@/App";
import { ExternalLink } from "lucide-react";

export const DrillCard = ({ dimension, score, id }) => {
  const [drill, setDrill] = useState(null);

  useEffect(() => {
    fetchDrill();
  }, [dimension]);

  const fetchDrill = async () => {
    try {
      const response = await axios.get(`${API}/drills/${dimension}`, {
        withCredentials: true,
      });
      setDrill(response.data);
    } catch (error) {
      console.error("Error fetching drill:", error);
    }
  };

  const getContext = (score) => {
    if (score >= 8) return "Keep up the good work — refine this further.";
    if (score >= 6) return "Solid foundation — a few tweaks here.";
    if (score >= 4) return "Room to grow — try this drill.";
    return "Starting point. Here's how to build.";
  };

  const getYouTubeSearchUrl = () => {
    const query = encodeURIComponent(`${dimension} boxing drill tutorial`);
    return `https://www.youtube.com/results?search_query=${query}`;
  };

  if (!drill) return null;

  return (
    <div
      id={id}
      className="victory-card p-4"
      data-testid={`drill-card-${dimension}`}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-victory-lime font-semibold">{dimension}</span>
        {score !== undefined && (
          <span className="font-mono text-sm font-semibold text-victory-muted bg-victory-card-highlight px-2 py-1 rounded">
            {score}/10
          </span>
        )}
      </div>

      <p className="text-victory-muted text-sm mb-3">{getContext(score)}</p>

      <h3 className="text-victory-text font-medium mb-1">{drill.name}</h3>
      <p className="text-victory-muted text-sm mb-4">{drill.description}</p>

      <a
        href={getYouTubeSearchUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="victory-btn-secondary inline-flex items-center gap-2 text-sm py-2 px-4"
        data-testid={`watch-drill-${dimension}`}
      >
        <ExternalLink className="w-4 h-4" />
        Watch Drill
      </a>
    </div>
  );
};

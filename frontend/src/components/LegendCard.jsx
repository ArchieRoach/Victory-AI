import { ExternalLink } from "lucide-react";

export const LegendCard = ({ legend }) => {
  const getYouTubeSearchUrl = () => {
    const query = encodeURIComponent(legend.youtube_search);
    return `https://www.youtube.com/results?search_query=${query}`;
  };

  return (
    <div className="victory-card p-4" data-testid={`legend-${legend.name}`}>
      <div className="mb-3">
        <h3 className="text-victory-text font-heading font-bold text-lg">
          {legend.name}
        </h3>
        <p className="text-victory-muted text-sm">
          "{legend.nickname}" • {legend.era}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {legend.dimensions.map((dim) => (
          <span key={dim} className="dimension-tag">
            {dim}
          </span>
        ))}
      </div>

      <p className="text-victory-text text-sm leading-relaxed mb-4">
        {legend.description}
      </p>

      <a
        href={getYouTubeSearchUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="victory-btn-secondary inline-flex items-center gap-2 text-sm py-2 px-4"
        data-testid={`watch-legend-${legend.name}`}
      >
        <ExternalLink className="w-4 h-4" />
        Watch Breakdown
      </a>
    </div>
  );
};

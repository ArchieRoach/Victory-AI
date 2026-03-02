export const DimensionSlider = ({
  dimension,
  rubric,
  value,
  onChange,
  onSkip,
}) => {
  const displayValue = value !== undefined ? value : 5;
  const isScored = value !== undefined;

  return (
    <div
      className="victory-card p-4"
      data-testid={`slider-${dimension}`}
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-victory-text font-medium">{dimension}</h3>
        <span
          className={`font-mono text-3xl font-semibold transition-colors ${
            isScored ? "text-victory-lime" : "text-victory-muted"
          }`}
        >
          {isScored ? value : "—"}
        </span>
      </div>

      <input
        type="range"
        min={1}
        max={10}
        value={displayValue}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-12 touch-target"
        style={{
          "--progress": `${((displayValue - 1) / 9) * 100}%`,
        }}
        data-testid={`slider-input-${dimension}`}
      />

      <div className="flex justify-between text-xs text-victory-muted mt-1 mb-3">
        <span>1</span>
        <span>5</span>
        <span>10</span>
      </div>

      <p className="text-victory-muted text-sm mb-3">{rubric}</p>

      {isScored && (
        <button
          onClick={onSkip}
          className="text-victory-muted text-sm hover:text-victory-text transition-colors"
          data-testid={`skip-${dimension}`}
        >
          Skip this dimension
        </button>
      )}
    </div>
  );
};

// One switch row for every on/off setting, so they all line up: same icon box, same
// switch size, and the switch never gets squashed by a long description.
export function ToggleRow({ on, onToggle, iconOn: IconOn, iconOff: IconOff, title, description, testId }) {
  const Icon = on ? IconOn : (IconOff || IconOn);
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onToggle(!on)}
      className="w-full flex items-center justify-between gap-3 touch-target text-left"
      data-testid={testId}
    >
      <span className="flex items-center gap-3 min-w-0">
        <Icon className={`w-6 h-6 flex-shrink-0 ${on ? "text-victory-lime" : "text-victory-muted"}`} />
        <span className="min-w-0">
          <span className="block text-victory-text font-medium">{title}</span>
          {description && <span className="block text-victory-muted text-sm">{description}</span>}
        </span>
      </span>
      <span className={`relative w-12 h-7 rounded-full flex-shrink-0 transition-colors ${on ? "bg-victory-lime" : "bg-victory-border"}`} aria-hidden="true">
        <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0"}`} />
      </span>
    </button>
  );
}

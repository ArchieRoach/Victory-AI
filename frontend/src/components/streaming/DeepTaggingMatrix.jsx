import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";

const WEIGHT_CLASSES = [
  "Heavyweight", "Cruiserweight", "Light Heavyweight",
  "Super Middleweight", "Middleweight", "Super Welterweight",
  "Welterweight", "Super Lightweight", "Lightweight",
  "Super Featherweight", "Featherweight", "Bantamweight",
];

const CATEGORIES = ["Professional", "Amateur", "Training"];
const ROLES      = ["Boxer", "Coach", "Commentator", "Analyst"];

const STATUSES = [
  { label: "All",      value: null   },
  { label: "Live Now", value: "live" },
  { label: "Recent",   value: "idle" },
];

function Pill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition-colors flex-shrink-0 ${
        active
          ? "bg-victory-lime text-victory-bg"
          : "bg-victory-card border border-victory-border text-victory-muted hover:border-victory-lime/40 hover:text-victory-text"
      }`}
    >
      {children}
    </button>
  );
}

function FilterGroup({ label, options, active, onToggle }) {
  return (
    <div>
      <p className="text-victory-muted text-xs font-semibold uppercase tracking-wider mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <Pill key={opt} active={active === opt} onClick={() => onToggle(opt)}>
            {opt}
          </Pill>
        ))}
      </div>
    </div>
  );
}

export function DeepTaggingMatrix({ filters, onChange }) {
  const [expanded, setExpanded] = useState(false);

  const activeCount = [filters.weight_class, filters.category, filters.role].filter(Boolean).length;

  const clearAll = () =>
    onChange({ ...filters, weight_class: null, category: null, role: null });

  const toggle = (key, val) =>
    onChange({ ...filters, [key]: filters[key] === val ? null : val });

  return (
    <div className="space-y-2">
      {/* Row 1: status tabs + filter toggle button */}
      <div className="flex items-center gap-2 px-4">
        {/* Horizontally scrollable status pills */}
        <div className="flex gap-1.5 flex-1 overflow-x-auto scrollbar-none pb-0.5">
          {STATUSES.map(({ label, value }) => (
            <Pill
              key={label}
              active={filters.status === value}
              onClick={() => onChange({ ...filters, status: value })}
            >
              {label}
            </Pill>
          ))}
        </div>

        {/* Expand / collapse button */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
            activeCount > 0 || expanded
              ? "border-victory-lime text-victory-lime bg-victory-lime/10"
              : "border-victory-border text-victory-muted hover:border-victory-lime/40"
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filters
          {activeCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-victory-lime text-victory-bg text-[10px] font-bold flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* Row 2: active filter chips (quick-clear) */}
      {activeCount > 0 && !expanded && (
        <div className="flex items-center gap-2 px-4 overflow-x-auto scrollbar-none pb-0.5">
          {[
            { key: "category",    val: filters.category    },
            { key: "role",        val: filters.role        },
            { key: "weight_class",val: filters.weight_class},
          ]
            .filter(({ val }) => val)
            .map(({ key, val }) => (
              <button
                key={key}
                onClick={() => onChange({ ...filters, [key]: null })}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-victory-lime/15 border border-victory-lime/30 text-victory-lime flex-shrink-0"
              >
                {val}
                <X className="w-3 h-3" />
              </button>
            ))}
          <button
            onClick={clearAll}
            className="text-xs text-victory-muted hover:text-red-400 transition-colors whitespace-nowrap flex-shrink-0 ml-1"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Expanded panel */}
      {expanded && (
        <div className="mx-4 bg-victory-card border border-victory-border rounded-xl p-4 space-y-4">
          <FilterGroup
            label="Category"
            options={CATEGORIES}
            active={filters.category}
            onToggle={(v) => toggle("category", v)}
          />
          <FilterGroup
            label="Role"
            options={ROLES}
            active={filters.role}
            onToggle={(v) => toggle("role", v)}
          />
          <FilterGroup
            label="Weight Class"
            options={WEIGHT_CLASSES}
            active={filters.weight_class}
            onToggle={(v) => toggle("weight_class", v)}
          />

          {activeCount > 0 && (
            <button
              onClick={() => { clearAll(); setExpanded(false); }}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

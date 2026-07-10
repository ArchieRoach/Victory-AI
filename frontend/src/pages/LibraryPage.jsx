import { useState, useEffect } from "react";
import axios from "axios";
import { API } from "@/App";
import { toast } from "sonner";
import { BottomNav } from "@/components/BottomNav";
import { LegendCard } from "@/components/LegendCard";
import { useTranslation } from "react-i18next";
import { BookOpen } from "lucide-react";

export default function LibraryPage() {
  const { t } = useTranslation();
  const [legends, setLegends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("All");

  const FILTERS = [
    { value: "All", label: t("library.filterAll") },
    { value: "Offensive", label: t("library.filterOffensive") },
    { value: "Defensive", label: t("library.filterDefensive") },
    { value: "Footwork & Movement", label: t("library.filterFootwork") },
    { value: "Combinations", label: t("library.filterCombinations") },
  ];

  // Map each filter to the training dimensions it covers (legends carry a `dimensions` array).
  const FILTER_DIMENSIONS = {
    Offensive: ["Jab", "Cross", "Left Hook", "Right Hook", "Uppercut", "Combination Flow", "Punch Balance", "Punch Accuracy"],
    Defensive: ["Guard Position", "Head Movement", "Slip", "Roll", "Parry", "Body Movement"],
    "Footwork & Movement": ["Footwork", "Ring Generalship", "Body Movement"],
    Combinations: ["Combination Flow"],
  };

  useEffect(() => {
    fetchLegends();
  }, []);

  const fetchLegends = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/legends`, { withCredentials: true });
      setLegends(response.data);
    } catch {
      toast.error("Failed to load techniques — try again");
    } finally {
      setLoading(false);
    }
  };

  const visibleLegends = activeFilter === "All"
    ? legends
    : legends.filter((l) => (l.dimensions || []).some((d) => (FILTER_DIMENSIONS[activeFilter] || []).includes(d)));

  return (
    <div className="min-h-screen bg-victory-bg pb-nav" data-testid="library-page">
      {/* Header */}
      <header className="p-4">
        <h1 className="text-2xl font-heading font-extrabold text-victory-text">
          {t("library.title")}
        </h1>
        <p className="text-victory-muted text-sm mt-1">
          {t("library.subtitle")}
        </p>
      </header>

      {/* Filter Pills */}
      <div className="px-4 pb-4">
        <div className="flex gap-2 overflow-x-auto no-scrollbar filter-scroll">
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setActiveFilter(filter.value)}
              className={`filter-pill ${
                activeFilter === filter.value
                  ? "filter-pill-active"
                  : "filter-pill-inactive"
              }`}
              data-testid={`filter-${filter.value}`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Legend Cards */}
      <main className="px-4 space-y-4">
        {loading ? (
          // Skeleton loaders
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="victory-card p-4 skeleton-shimmer h-32" />
            ))}
          </>
        ) : visibleLegends.length > 0 ? (
          visibleLegends.map((legend) => (
            <LegendCard key={legend.name} legend={legend} />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-victory-lime/10 border border-victory-lime/20 flex items-center justify-center mb-4">
              <BookOpen className="w-8 h-8 text-victory-lime/60" />
            </div>
            <p className="text-victory-text font-bold text-lg mb-1">
              {t("library.noTechniques")}
            </p>
            <p className="text-victory-muted text-sm">
              {activeFilter === "All"
                ? "Techniques will appear here once available."
                : `No techniques match the "${activeFilter}" filter — try All.`}
            </p>
            {activeFilter !== "All" && (
              <button
                onClick={() => setActiveFilter("All")}
                className="mt-4 text-victory-lime text-sm font-semibold underline underline-offset-2"
              >
                Show all techniques
              </button>
            )}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

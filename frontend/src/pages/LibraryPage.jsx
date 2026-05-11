import { useState, useEffect } from "react";
import axios from "axios";
import { API } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { LegendCard } from "@/components/LegendCard";
import { useTranslation } from "react-i18next";

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

  useEffect(() => {
    fetchLegends();
  }, [activeFilter]);

  const fetchLegends = async () => {
    setLoading(true);
    try {
      const params = activeFilter !== "All" ? { filter: activeFilter } : {}; // activeFilter holds the English value for the API
      const response = await axios.get(`${API}/legends`, {
        params,
        withCredentials: true,
      });
      setLegends(response.data);
    } catch (error) {
      console.error("Error fetching legends:", error);
    } finally {
      setLoading(false);
    }
  };

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
        ) : legends.length > 0 ? (
          legends.map((legend) => (
            <LegendCard key={legend.name} legend={legend} />
          ))
        ) : (
          <div className="victory-card p-6 text-center">
            <p className="text-victory-muted">
              {t("library.noTechniques")}
            </p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

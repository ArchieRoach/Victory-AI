import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { DimensionSlider } from "@/components/DimensionSlider";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Link, FileText } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const DIMENSION_GROUPS = {
  "Offensive Technique": [
    "Jab",
    "Cross",
    "Left Hook",
    "Right Hook",
    "Uppercut",
    "Combination Flow",
    "Punch Balance",
    "Punch Accuracy",
  ],
  "Defensive Technique": [
    "Guard Position",
    "Head Movement",
    "Slip",
    "Roll",
    "Parry",
    "Body Movement",
  ],
  "Movement & Ring Craft": ["Footwork", "Ring Generalship"],
};

const DIMENSION_RUBRICS = {
  Jab: "Extension, snap, and return speed — are you recovering guard after every jab?",
  Cross: "Hip rotation driving power — does your weight transfer fully?",
  "Left Hook":
    "Elbow parallel to floor, pivot from hips — not just an arm swing",
  "Right Hook": "Short arc, tight rotation — watch for overextension",
  Uppercut:
    "Knees dipping to load power, fist scooping upward — not a looping swing",
  "Combination Flow":
    "Transitions between punches — smooth or choppy? Each punch sets up the next",
  "Punch Balance":
    "Are you off-balance after combinations, or back in stance quickly?",
  "Punch Accuracy":
    "Are punches landing where you aimed, or are they sailing wide?",
  "Guard Position":
    "Hands at cheekbone height, elbows in — consistent between punches?",
  "Head Movement": "Moving your head off centreline before and after punching",
  Slip: "Rotating outside the punch line, not just ducking",
  Roll: "Full shoulder-to-shoulder roll under hooks — smooth continuous motion",
  Parry: "Redirecting punches with open hand, not blocking or stopping them",
  "Body Movement":
    "Angling off after punching — not standing flat in front of opponent",
  Footwork:
    "Weight centred, not flat-footed — pivoting and stepping without crossing feet",
  "Ring Generalship":
    "Controlling distance, cutting off the ring, dictating where the fight happens",
};

const STORAGE_KEY = "victory_score_draft";

export default function ScorePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [sessionNotes, setSessionNotes] = useState("");
  const [sessionDate, setSessionDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [scores, setScores] = useState({});
  const [expandedGroups, setExpandedGroups] = useState({
    "Offensive Technique": true,
    "Defensive Technique": true,
    "Movement & Ring Craft": true,
  });

  // Load draft from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        setScores(draft.scores || {});
        setVideoUrl(draft.videoUrl || "");
        setSessionNotes(draft.sessionNotes || "");
        if (draft.sessionDate) setSessionDate(draft.sessionDate);
      } catch (e) {
        console.error("Failed to load draft:", e);
      }
    }
  }, []);

  // Auto-save to localStorage (debounced)
  const saveDraft = useCallback(() => {
    const draft = { scores, videoUrl, sessionNotes, sessionDate };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  }, [scores, videoUrl, sessionNotes, sessionDate]);

  useEffect(() => {
    const timer = setTimeout(saveDraft, 500);
    return () => clearTimeout(timer);
  }, [saveDraft]);

  const handleScoreChange = (dimension, value) => {
    setScores((prev) => ({
      ...prev,
      [dimension]: value,
    }));
  };

  const handleSkip = (dimension) => {
    setScores((prev) => {
      const newScores = { ...prev };
      delete newScores[dimension];
      return newScores;
    });
  };

  const getScoredCount = () => Object.keys(scores).length;
  const getTotalDimensions = () => 16;
  const getProgress = () => (getScoredCount() / getTotalDimensions()) * 100;

  const handleSubmit = async () => {
    const scoredCount = getScoredCount();
    if (scoredCount < 5) {
      toast.error(
        `Score at least 5 dimensions to get meaningful recommendations. You've scored ${scoredCount} so far.`
      );
      return;
    }

    setLoading(true);
    try {
      // Build dimension scores array
      const dimensionScores = Object.values(DIMENSION_GROUPS)
        .flat()
        .map((dim) => ({
          dimension_name: dim,
          score: scores[dim] !== undefined ? scores[dim] : null,
        }));

      const response = await axios.post(
        `${API}/sessions`,
        {
          video_url: videoUrl || null,
          session_notes: sessionNotes || null,
          date: sessionDate,
          dimension_scores: dimensionScores,
        },
        { withCredentials: true }
      );

      // Clear draft
      localStorage.removeItem(STORAGE_KEY);

      // Navigate to results
      navigate("/score/results", {
        state: { session: response.data, isFirstSession: false },
      });
    } catch (error) {
      const message = error.response?.data?.detail || "Failed to save session";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const toggleGroup = (group) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [group]: !prev[group],
    }));
  };

  return (
    <div className="min-h-screen bg-victory-bg pb-nav" data-testid="score-page">
      {/* Header with Progress */}
      <header className="sticky top-0 z-40 bg-victory-bg/95 backdrop-blur-sm border-b border-victory-border p-4">
        <h1 className="text-xl font-heading font-extrabold text-victory-text mb-1">
          Score This Round
        </h1>
        <p className="text-victory-muted text-sm mb-3">
          Be honest — your baseline is where progress begins
        </p>
        <div className="flex items-center gap-3">
          <Progress value={getProgress()} className="flex-1 h-2" />
          <span className="text-victory-muted text-sm font-mono">
            {getScoredCount()} of {getTotalDimensions()}
          </span>
        </div>
      </header>

      <main className="p-4 space-y-6">
        {/* Optional Fields */}
        <section className="space-y-4">
          <div>
            <label className="victory-label flex items-center gap-2">
              <Link className="w-4 h-4" />
              Paste a link to your video (optional)
            </label>
            <input
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="YouTube, Google Drive, or any video link"
              className="victory-input"
              data-testid="video-url-input"
            />
          </div>

          <div>
            <label className="victory-label flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Session notes (optional)
            </label>
            <textarea
              value={sessionNotes}
              onChange={(e) => setSessionNotes(e.target.value)}
              placeholder="What did you work on today?"
              rows={3}
              className="victory-input resize-none"
              data-testid="session-notes-input"
            />
          </div>

          <div>
            <label className="victory-label">Date</label>
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              className="victory-input"
              data-testid="session-date-input"
            />
          </div>
        </section>

        {/* Dimension Groups */}
        {Object.entries(DIMENSION_GROUPS).map(([groupName, dimensions]) => (
          <Collapsible
            key={groupName}
            open={expandedGroups[groupName]}
            onOpenChange={() => toggleGroup(groupName)}
          >
            <CollapsibleTrigger asChild>
              <button
                className="w-full victory-card p-4 flex items-center justify-between touch-target"
                data-testid={`group-${groupName}`}
              >
                <div className="flex items-center gap-3">
                  <h2 className="font-heading font-bold text-victory-text">
                    {groupName}
                  </h2>
                  <span className="text-victory-muted text-sm">
                    {dimensions.filter((d) => scores[d] !== undefined).length}/
                    {dimensions.length}
                  </span>
                </div>
                {expandedGroups[groupName] ? (
                  <ChevronUp className="w-5 h-5 text-victory-muted" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-victory-muted" />
                )}
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent className="space-y-4 mt-4">
              {dimensions.map((dimension) => (
                <DimensionSlider
                  key={dimension}
                  dimension={dimension}
                  rubric={DIMENSION_RUBRICS[dimension]}
                  value={scores[dimension]}
                  onChange={(value) => handleScoreChange(dimension, value)}
                  onSkip={() => handleSkip(dimension)}
                />
              ))}
            </CollapsibleContent>
          </Collapsible>
        ))}

        {/* Error message area */}
        {getScoredCount() < 5 && getScoredCount() > 0 && (
          <p className="text-victory-orange text-sm text-center">
            Score at least 5 dimensions to get meaningful recommendations.
            You've scored {getScoredCount()} so far.
          </p>
        )}
      </main>

      {/* Fixed Submit Button */}
      <div className="fixed bottom-20 left-0 right-0 p-4 bg-victory-bg/95 backdrop-blur-sm border-t border-victory-border">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="victory-btn-primary"
          data-testid="submit-scorecard-btn"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-victory-bg border-t-transparent rounded-full animate-spin" />
              Saving...
            </span>
          ) : (
            "See My Scorecard"
          )}
        </button>
      </div>

      <BottomNav />
    </div>
  );
}

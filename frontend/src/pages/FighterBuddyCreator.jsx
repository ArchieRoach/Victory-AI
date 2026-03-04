import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { toast } from "sonner";
import { ChevronRight, Sparkles, User } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const WEIGHT_CLASSES = [
  "Flyweight", "Bantamweight", "Featherweight", "Lightweight",
  "Welterweight", "Middleweight", "Light Heavyweight", "Heavyweight"
];

const STANCES = ["Orthodox", "Southpaw"];

const FAVORITE_PUNCHES = [
  "Jab", "Cross", "Left Hook", "Right Hook", "Uppercut", "Body Shot"
];

export default function FighterBuddyCreator() {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [archetypes, setArchetypes] = useState({});
  const [loading, setLoading] = useState(false);
  const [generatingAvatar, setGeneratingAvatar] = useState(false);
  const [step, setStep] = useState(1); // 1: details, 2: archetype
  
  const [buddyData, setBuddyData] = useState({
    name: "",
    weight_class: "Welterweight",
    stance: "Orthodox",
    favorite_punch: "Jab",
    archetype: "",
  });

  useEffect(() => {
    fetchArchetypes();
  }, []);

  const fetchArchetypes = async () => {
    try {
      const response = await axios.get(`${API}/fighter-buddy/archetypes`, {
        withCredentials: true,
      });
      setArchetypes(response.data.archetypes);
    } catch (error) {
      console.error("Failed to fetch archetypes:", error);
    }
  };

  const handleCreateBuddy = async () => {
    if (!buddyData.name || !buddyData.archetype) {
      toast.error("Please complete all fields");
      return;
    }

    setLoading(true);
    try {
      // Create fighter buddy
      const response = await axios.post(
        `${API}/fighter-buddy/create`,
        buddyData,
        { withCredentials: true }
      );

      // Generate avatar
      setGeneratingAvatar(true);
      try {
        const avatarResponse = await axios.post(
          `${API}/fighter-buddy/generate-avatar`,
          {},
          { withCredentials: true }
        );
        response.data.avatar_url = avatarResponse.data.avatar_url;
      } catch (avatarError) {
        console.error("Avatar generation failed:", avatarError);
      }
      setGeneratingAvatar(false);

      // Update user context
      setUser({ ...user, fighter_buddy: response.data });

      toast.success(`${buddyData.name} is ready to train with you!`);
      navigate("/paywall", { replace: true });
    } catch (error) {
      toast.error("Failed to create fighter buddy");
    } finally {
      setLoading(false);
    }
  };

  const selectedArchetype = archetypes[buddyData.archetype];

  return (
    <div
      className="min-h-screen bg-victory-bg flex flex-col"
      data-testid="fighter-buddy-creator"
    >
      <header className="p-4 border-b border-victory-border">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-victory-lime flex items-center justify-center">
            <User className="w-5 h-5 text-victory-bg" />
          </div>
          <div>
            <h1 className="text-lg font-heading font-bold text-victory-text">
              Create Your Fighter Buddy
            </h1>
            <p className="text-victory-muted text-sm">
              A training buddy, not a coach — your AI sparring partner
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 overflow-y-auto">
        {step === 1 ? (
          <div className="space-y-6 animate-fade-in">
            <div>
              <label className="victory-label">Fighter Name</label>
              <input
                type="text"
                value={buddyData.name}
                onChange={(e) =>
                  setBuddyData({ ...buddyData, name: e.target.value })
                }
                placeholder="Give your buddy a name"
                className="victory-input"
                data-testid="buddy-name-input"
              />
            </div>

            <div>
              <label className="victory-label">Weight Class</label>
              <Select
                value={buddyData.weight_class}
                onValueChange={(value) =>
                  setBuddyData({ ...buddyData, weight_class: value })
                }
              >
                <SelectTrigger className="victory-input" data-testid="weight-class-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-victory-card border-victory-border">
                  {WEIGHT_CLASSES.map((wc) => (
                    <SelectItem
                      key={wc}
                      value={wc}
                      className="text-victory-text hover:bg-victory-card-highlight"
                    >
                      {wc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="victory-label">Stance</label>
              <div className="grid grid-cols-2 gap-3">
                {STANCES.map((stance) => (
                  <button
                    key={stance}
                    onClick={() => setBuddyData({ ...buddyData, stance })}
                    className={`p-4 rounded-lg border text-center touch-target transition-all ${
                      buddyData.stance === stance
                        ? "bg-victory-lime/10 border-victory-lime text-victory-lime"
                        : "bg-victory-card border-victory-border text-victory-text"
                    }`}
                    data-testid={`stance-${stance.toLowerCase()}`}
                  >
                    {stance}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="victory-label">Favorite Punch</label>
              <Select
                value={buddyData.favorite_punch}
                onValueChange={(value) =>
                  setBuddyData({ ...buddyData, favorite_punch: value })
                }
              >
                <SelectTrigger className="victory-input" data-testid="punch-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-victory-card border-victory-border">
                  {FAVORITE_PUNCHES.map((punch) => (
                    <SelectItem
                      key={punch}
                      value={punch}
                      className="text-victory-text hover:bg-victory-card-highlight"
                    >
                      {punch}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={!buddyData.name}
              className="victory-btn-primary flex items-center justify-center gap-2"
              data-testid="next-step-btn"
            >
              Choose Fighting Style
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="space-y-4 animate-fade-in">
            <button
              onClick={() => setStep(1)}
              className="text-victory-muted text-sm flex items-center gap-1 hover:text-victory-text mb-4"
            >
              ← Back to details
            </button>

            <h2 className="text-lg font-heading font-bold text-victory-text mb-4">
              Choose {buddyData.name}'s Style
            </h2>

            <div className="space-y-3 max-h-[50vh] overflow-y-auto">
              {Object.entries(archetypes).map(([key, archetype]) => (
                <button
                  key={key}
                  onClick={() => setBuddyData({ ...buddyData, archetype: key })}
                  className={`w-full p-4 rounded-lg border text-left transition-all ${
                    buddyData.archetype === key
                      ? "bg-victory-lime/10 border-victory-lime"
                      : "bg-victory-card border-victory-border hover:border-victory-muted"
                  }`}
                  data-testid={`archetype-${key}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-victory-text">
                      {archetype.name}
                    </h3>
                    {buddyData.archetype === key && (
                      <Sparkles className="w-5 h-5 text-victory-lime" />
                    )}
                  </div>
                  <p className="text-victory-muted text-sm mb-2">
                    Inspired by {archetype.inspired_by}
                  </p>
                  <p className="text-victory-text text-sm">
                    {archetype.personality}
                  </p>
                </button>
              ))}
            </div>

            {/* Preview */}
            {selectedArchetype && (
              <div className="victory-card p-4 mt-4">
                <h3 className="text-victory-lime font-semibold mb-2">
                  {buddyData.name} Preview
                </h3>
                <p className="text-victory-muted text-sm mb-2">
                  "{selectedArchetype.catchphrases?.[0]}"
                </p>
                <p className="text-victory-text text-sm">
                  {buddyData.weight_class} • {buddyData.stance} • Loves the{" "}
                  {buddyData.favorite_punch}
                </p>
              </div>
            )}

            <button
              onClick={handleCreateBuddy}
              disabled={!buddyData.archetype || loading}
              className="victory-btn-primary flex items-center justify-center gap-2"
              data-testid="create-buddy-btn"
            >
              {loading ? (
                <>
                  <span className="w-5 h-5 border-2 border-victory-bg border-t-transparent rounded-full animate-spin" />
                  {generatingAvatar ? "Creating Avatar..." : "Creating..."}
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Create {buddyData.name || "Fighter Buddy"}
                </>
              )}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

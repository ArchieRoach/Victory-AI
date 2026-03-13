import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { toast } from "sonner";
import { ChevronRight, Star, Users, Target, Zap, Check, Quote } from "lucide-react";
import { Progress } from "@/components/ui/progress";

// PHASE 1: AFFIRMATION - Social proof and congratulations
const AffirmationPhase = ({ stats, testimonials, onNext }) => (
  <div className="animate-fade-in space-y-6">
    <div className="text-center mb-8">
      <img 
        src="/victory-logo.png"
        alt="Victory AI"
        className="w-20 h-20 mx-auto mb-4 object-contain"
      />
      <h1 className="text-2xl font-heading font-extrabold text-victory-text mb-2">
        Smart move, champ.
      </h1>
      <p className="text-victory-muted">
        You just joined thousands of fighters who are getting better every round.
      </p>
    </div>

    {/* Stats */}
    <div className="grid grid-cols-2 gap-3">
      <div className="victory-card p-4 text-center">
        <p className="font-mono text-2xl font-bold text-victory-lime">{stats?.rounds_recorded || "50,000+"}</p>
        <p className="text-victory-muted text-xs">Rounds Recorded</p>
      </div>
      <div className="victory-card p-4 text-center">
        <p className="font-mono text-2xl font-bold text-victory-lime">{stats?.avg_improvement || "34%"}</p>
        <p className="text-victory-muted text-xs">Avg Improvement</p>
      </div>
    </div>

    {/* Testimonial */}
    {testimonials && testimonials[0] && (
      <div className="victory-card p-4">
        <Quote className="w-6 h-6 text-victory-lime mb-2" />
        <p className="text-victory-text text-sm italic mb-3">
          "{testimonials[0].text}"
        </p>
        <div className="flex items-center justify-between">
          <span className="text-victory-muted text-xs">— {testimonials[0].name}</span>
          <span className="text-victory-lime text-xs font-semibold">{testimonials[0].improvement}</span>
        </div>
      </div>
    )}

    <button onClick={onNext} className="victory-btn-primary flex items-center justify-center gap-2" data-testid="affirmation-next">
      Let's Build Your AI Training Partner
      <ChevronRight className="w-5 h-5" />
    </button>
  </div>
);

// PHASE 2: WHY HOOK - Motivation questions with simple options
const WhyHookPhase = ({ onAnswer, currentQuestion, answers }) => {
  const getCounterOptions = (stance) => {
    if (stance === "southpaw") {
      return [
        { value: "jab", label: "Jab (lead right)", icon: "👊" },
        { value: "cross", label: "Straight left (cross)", icon: "💥" },
        { value: "right_hook", label: "Right hook", icon: "🪝" },
        { value: "uppercut", label: "Uppercut", icon: "⬆️" },
        { value: "body_shot", label: "Body shot", icon: "🎯" },
      ];
    }
    return [
      { value: "jab", label: "Jab (lead left)", icon: "👊" },
      { value: "cross", label: "Straight right (cross)", icon: "💥" },
      { value: "left_hook", label: "Left hook", icon: "🪝" },
      { value: "uppercut", label: "Uppercut", icon: "⬆️" },
      { value: "body_shot", label: "Body shot", icon: "🎯" },
    ];
  };

  const questions = [
    {
      id: "why_downloaded",
      question: "What made you download Victory AI today?",
      subtitle: "Be honest — we'll tailor everything to this",
      options: [
        { value: "improve_technique", label: "I want to fix my technique", icon: "🎯" },
        { value: "get_feedback", label: "I train alone and need feedback", icon: "👀" },
        { value: "stay_consistent", label: "I struggle with consistency", icon: "📅" },
        { value: "prepare_fight", label: "I'm preparing for a fight/sparring", icon: "🥊" },
        { value: "just_curious", label: "Just curious to try it", icon: "🤔" },
      ]
    },
    {
      id: "heard_from",
      question: "Where did you hear about us?",
      subtitle: "Helps us find more fighters like you",
      options: [
        { value: "social_media", label: "Social media (TikTok, Instagram)", icon: "📱" },
        { value: "youtube", label: "YouTube", icon: "▶️" },
        { value: "friend", label: "A friend or training partner", icon: "👥" },
        { value: "search", label: "Google search", icon: "🔍" },
        { value: "other", label: "Somewhere else", icon: "🌐" },
      ]
    },
    {
      id: "biggest_frustration",
      question: "What frustrates you most about training?",
      subtitle: "This is what your partner will focus on fixing",
      options: [
        { value: "no_feedback", label: "No one tells me what I'm doing wrong", icon: "🤷" },
        { value: "bad_habits", label: "I keep repeating the same bad habits", icon: "🔄" },
        { value: "defense_weak", label: "My defense is weak", icon: "🛡️" },
        { value: "no_power", label: "My punches lack power", icon: "💪" },
        { value: "footwork", label: "My footwork is sloppy", icon: "👣" },
      ]
    },
    {
      id: "training_frequency",
      question: "How often do you train boxing?",
      options: [
        { value: "daily", label: "Almost every day", icon: "🔥" },
        { value: "3-4_week", label: "3-4 times a week", icon: "💪" },
        { value: "1-2_week", label: "1-2 times a week", icon: "📅" },
        { value: "inconsistent", label: "Whenever I can (inconsistent)", icon: "🎲" },
        { value: "just_starting", label: "Just starting out", icon: "🌱" },
      ]
    },
    {
      id: "experience_level",
      question: "How long have you been boxing?",
      options: [
        { value: "complete_beginner", label: "Complete beginner", icon: "🌱" },
        { value: "under_6_months", label: "Under 6 months", icon: "📆" },
        { value: "6_18_months", label: "6-18 months", icon: "💪" },
        { value: "1_3_years", label: "1-3 years", icon: "🥊" },
        { value: "3_plus_years", label: "3+ years", icon: "🏆" },
      ]
    },
    {
      id: "boxing_stance",
      question: "What's your boxing stance?",
      subtitle: "This shapes which punches we focus on for you",
      options: [
        { value: "orthodox", label: "Orthodox (left foot forward)", icon: "🥊" },
        { value: "southpaw", label: "Southpaw (right foot forward)", icon: "🔄" },
        { value: "switch", label: "Switch hitter (both stances)", icon: "⚡" },
        { value: "not_sure", label: "Not sure yet", icon: "🤔" },
      ]
    },
    {
      id: "favorite_counter",
      question: "What's your favorite counter punch?",
      subtitle: "We'll help you land it more often",
      options: getCounterOptions(answers.boxing_stance),
    },
    {
      id: "favorite_fighter",
      question: "Who is your favourite boxer of all time?",
      subtitle: "Your training partner's image will be inspired by them",
      options: [
        { value: "Muhammad Ali", label: "Muhammad Ali", icon: "👑" },
        { value: "Mike Tyson", label: "Mike Tyson", icon: "🔥" },
        { value: "Floyd Mayweather", label: "Floyd Mayweather", icon: "💰" },
        { value: "Terence Crawford", label: "Terence Crawford", icon: "⚡" },
        { value: "Usyk", label: "Usyk", icon: "🥊" },
        { value: "Canelo Alvarez", label: "Canelo Alvarez", icon: "🌹" },
        { value: "Manny Pacquiao", label: "Manny Pacquiao", icon: "🇵🇭" },
        { value: "Artur Beterbiev", label: "Artur Beterbiev", icon: "💪" },
        { value: "Roberto Duran", label: "Roberto Duran", icon: "✊" },
      ],
    },
  ];

  const q = questions[currentQuestion];
  if (!q) return null;

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-heading font-extrabold text-victory-text mb-1">
          {q.question}
        </h1>
        {q.subtitle && <p className="text-victory-muted text-sm">{q.subtitle}</p>}
      </div>

      <div className="space-y-3">
        {q.options.map((option) => (
          <button
            key={option.value}
            onClick={() => onAnswer(q.id, option.value)}
            className="w-full p-4 rounded-lg border bg-victory-card border-victory-border text-left flex items-center gap-4 touch-target transition-all hover:border-victory-lime active:scale-[0.98]"
            data-testid={`option-${option.value}`}
          >
            <span className="text-2xl">{option.icon}</span>
            <span className="text-victory-text font-medium">{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// PHASE 3: PERSONALIZED AFFIRMATION
const PersonalizedAffirmation = ({ answers, onNext }) => {
  const getAffirmation = () => {
    const frustration = answers.biggest_frustration;
    const counter = answers.favorite_counter;
    
    const affirmations = {
      no_feedback: "Getting real-time feedback on every punch is about to change everything for you.",
      bad_habits: "Your training partner will catch those habits and call them out every single round.",
      defense_weak: "Defense is 100% trainable. You'll be slipping punches like a pro within weeks.",
      no_power: "Power comes from technique. We'll fix your hip rotation and weight transfer.",
      footwork: "Footwork is the foundation. Daily reminders will make it second nature.",
    };
    
    const counterGoals = {
      jab: "Landing 2x more jabs in sparring",
      cross: "Making your cross a real weapon",
      left_hook: "Timing that left hook perfectly",
      right_hook: "Timing that right hook perfectly",
      uppercut: "Finding those uppercut openings",
      body_shot: "Breaking opponents down to the body",
    };
    
    return {
      main: affirmations[frustration] || "Your training partner will focus on exactly what you need.",
      counter: counterGoals[counter] || "Improving your counter game",
      honesty: "Real talk: the first two weeks feel slow. But by week 3, you'll wonder how you trained without this."
    };
  };

  const aff = getAffirmation();

  return (
    <div className="animate-fade-in space-y-6">
      <div className="text-center mb-4">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-victory-lime/20 mb-4">
          <Target className="w-6 h-6 text-victory-lime" />
        </div>
        <h1 className="text-xl font-heading font-extrabold text-victory-text mb-2">
          Here's what we heard
        </h1>
      </div>

      <div className="space-y-4">
        <div className="victory-card p-4 border-l-4 border-victory-lime">
          <p className="text-victory-text">{aff.main}</p>
        </div>
        
        <div className="victory-card p-4 border-l-4 border-victory-teal">
          <p className="text-victory-muted text-sm mb-1">Your realistic goal:</p>
          <p className="text-victory-text font-semibold">{aff.counter} within 8 weeks</p>
        </div>
        
        <div className="victory-card p-4 border-l-4 border-victory-orange">
          <p className="text-victory-muted text-sm mb-1">Honest expectation:</p>
          <p className="text-victory-text text-sm">{aff.honesty}</p>
        </div>
      </div>

      <button onClick={onNext} className="victory-btn-primary flex items-center justify-center gap-2" data-testid="affirmation-continue">
        Now Let's Create Your AI Training Partner
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
};

// PHASE 4: PARTNER CREATION
const PartnerCreationPhase = ({ styles, onAnswer, currentStep, partnerData }) => {
  const steps = [
    {
      id: "training_partner_style",
      question: "What kind of training partner do you want?",
      subtitle: "This shapes how they talk to you",
      options: Object.entries(styles || {}).map(([key, style]) => ({
        value: key,
        label: style.name,
        description: style.personality,
        icon: key === "tough_love" ? "💪" : key === "hype_man" ? "🔥" : key === "analytical_technician" ? "🧠" : key === "old_school_trainer" ? "🎖️" : "❤️"
      }))
    },
    {
      id: "accountability_level",
      question: "How hard should they push you?",
      subtitle: "This affects how they hold you accountable",
      options: [
        { value: "gentle", label: "Gentle reminders", description: "Encouraging nudges, no pressure", icon: "🌱" },
        { value: "moderate", label: "Balanced approach", description: "Firm but fair, consistent check-ins", icon: "⚖️" },
        { value: "high", label: "No excuses", description: "They won't let you slack off", icon: "🔥" },
      ]
    },
    {
      id: "focus_areas",
      question: "What should they focus on most?",
      subtitle: "Pick your top 2 priorities",
      multiSelect: true,
      maxSelect: 2,
      options: [
        { value: "Guard Position", label: "Guard position", icon: "🛡️" },
        { value: "Head Movement", label: "Head movement", icon: "↔️" },
        { value: "Footwork", label: "Footwork", icon: "👣" },
        { value: "Combination Flow", label: "Combinations", icon: "💥" },
        { value: "Punch Accuracy", label: "Accuracy", icon: "🎯" },
        { value: "Defense overall", label: "Overall defense", icon: "🥋" },
      ]
    },
  ];

  const step = steps[currentStep];
  if (!step) return null;

  const selectedValues = step.multiSelect ? (partnerData[step.id] || []) : partnerData[step.id];

  const handleSelect = (value) => {
    if (step.multiSelect) {
      const current = partnerData[step.id] || [];
      if (current.includes(value)) {
        onAnswer(step.id, current.filter(v => v !== value), false);
      } else if (current.length < (step.maxSelect || 2)) {
        onAnswer(step.id, [...current, value], current.length + 1 >= (step.maxSelect || 2));
      }
    } else {
      onAnswer(step.id, value, true);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-heading font-extrabold text-victory-text mb-1">
          {step.question}
        </h1>
        {step.subtitle && <p className="text-victory-muted text-sm">{step.subtitle}</p>}
      </div>

      <div className="space-y-3">
        {step.options.map((option) => {
          const isSelected = step.multiSelect 
            ? (selectedValues || []).includes(option.value)
            : selectedValues === option.value;
          
          return (
            <button
              key={option.value}
              onClick={() => handleSelect(option.value)}
              className={`w-full p-4 rounded-lg border text-left transition-all ${
                isSelected
                  ? "bg-victory-lime/10 border-victory-lime"
                  : "bg-victory-card border-victory-border hover:border-victory-muted"
              }`}
              data-testid={`partner-option-${option.value}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{option.icon}</span>
                <div className="flex-1">
                  <p className="text-victory-text font-medium">{option.label}</p>
                  {option.description && (
                    <p className="text-victory-muted text-sm mt-1">{option.description}</p>
                  )}
                </div>
                {isSelected && <Check className="w-5 h-5 text-victory-lime" />}
              </div>
            </button>
          );
        })}
      </div>

      {step.multiSelect && (
        <button
          onClick={() => onAnswer(step.id, partnerData[step.id], true)}
          disabled={!(partnerData[step.id]?.length > 0)}
          className="victory-btn-primary mt-6 flex items-center justify-center gap-2"
          data-testid="multi-continue"
        >
          Continue
          <ChevronRight className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};

// PHASE 5: GENERATING SCREEN (Performative delay)
const GeneratingScreen = ({ partnerData, styles, onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  
  const steps = [
    "Analyzing your training goals...",
    "Matching personality preferences...",
    "Building accountability system...",
    "Customizing feedback style...",
    "Creating your training partner..."
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(onComplete, 500);
          return 100;
        }
        return prev + 2;
      });
    }, 80);

    const stepInterval = setInterval(() => {
      setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
    }, 800);

    return () => {
      clearInterval(interval);
      clearInterval(stepInterval);
    };
  }, [onComplete]);

  const styleName = styles?.[partnerData.training_partner_style]?.name || "Training Partner";

  return (
    <div className="animate-fade-in flex flex-col items-center justify-center min-h-[60vh]">
      <div className="w-24 h-24 rounded-full bg-victory-lime/20 flex items-center justify-center mb-6 relative">
        <div className="w-20 h-20 rounded-full border-4 border-victory-lime border-t-transparent animate-spin absolute" />
        <Zap className="w-10 h-10 text-victory-lime" />
      </div>

      <h2 className="text-xl font-heading font-bold text-victory-text mb-2 text-center">
        Creating your {styleName}
      </h2>

      <p className="text-victory-muted text-sm mb-6 text-center animate-pulse">
        {steps[currentStep]}
      </p>

      <div className="w-full max-w-xs">
        <Progress value={progress} className="h-2" />
        <p className="text-victory-muted text-xs text-center mt-2">{progress}%</p>
      </div>
    </div>
  );
};

// PHASE 6: PARTNER NAMING
const PartnerNamingPhase = ({ partnerData, styles, onComplete }) => {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const styleName = styles?.[partnerData.training_partner_style]?.name || "Training Partner";
  const personality = styles?.[partnerData.training_partner_style]?.personality || "";

  const suggestedNames = ["Rocky", "Coach", "Champ", "Ace", "Iron", "Flash", "Duke", "Max"];

  const handleComplete = async () => {
    if (!name.trim()) {
      toast.error("Give your partner a name!");
      return;
    }
    setLoading(true);
    await onComplete(name);
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-victory-lime mb-4">
          <span className="text-3xl">🥊</span>
        </div>
        <h1 className="text-xl font-heading font-extrabold text-victory-text mb-2">
          Your {styleName} is ready
        </h1>
        <p className="text-victory-muted text-sm">{personality}</p>
      </div>

      <div>
        <label className="victory-label">What should they call themselves?</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter a name"
          className="victory-input text-center text-xl"
          data-testid="partner-name-input"
        />
      </div>

      <div>
        <p className="text-victory-muted text-xs mb-2">Or pick a suggestion:</p>
        <div className="flex flex-wrap gap-2">
          {suggestedNames.map(n => (
            <button
              key={n}
              onClick={() => setName(n)}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                name === n ? "bg-victory-lime text-victory-bg" : "bg-victory-card border border-victory-border text-victory-text"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleComplete}
        disabled={!name.trim() || loading}
        className="victory-btn-primary flex items-center justify-center gap-2"
        data-testid="complete-partner"
      >
        {loading ? (
          <span className="w-5 h-5 border-2 border-victory-bg border-t-transparent rounded-full animate-spin" />
        ) : (
          <>
            Meet {name || "Your Partner"}
            <ChevronRight className="w-5 h-5" />
          </>
        )}
      </button>
    </div>
  );
};

// MAIN COMPONENT
export default function OnboardingFlow() {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  
  const [phase, setPhase] = useState("affirmation"); // affirmation, why_hook, personalized, partner, generating, naming
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [currentPartnerStep, setCurrentPartnerStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [partnerData, setPartnerData] = useState({});
  const [socialProof, setSocialProof] = useState({ stats: {}, testimonials: [] });
  const [partnerStyles, setPartnerStyles] = useState({});

  useEffect(() => {
    fetchSocialProof();
    fetchPartnerStyles();
  }, []);

  const fetchSocialProof = async () => {
    try {
      const res = await axios.get(`${API}/onboarding/social-proof`, { withCredentials: true });
      setSocialProof(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPartnerStyles = async () => {
    try {
      const res = await axios.get(`${API}/onboarding/partner-styles`, { withCredentials: true });
      setPartnerStyles(res.data.styles);
    } catch (e) {
      console.error(e);
    }
  };

  const totalQuestions = 8;
  const totalPartnerSteps = 3;
  
  const getProgress = () => {
    if (phase === "affirmation") return 5;
    if (phase === "why_hook") return 10 + (currentQuestion / totalQuestions) * 40;
    if (phase === "personalized") return 55;
    if (phase === "partner") return 60 + (currentPartnerStep / totalPartnerSteps) * 25;
    if (phase === "generating") return 90;
    if (phase === "naming") return 95;
    return 100;
  };

  const handleWhyAnswer = (id, value) => {
    setAnswers(prev => ({ ...prev, [id]: value }));
    if (currentQuestion < totalQuestions - 1) {
      setTimeout(() => setCurrentQuestion(currentQuestion + 1), 200);
    } else {
      // Submit answers and move to personalized phase
      submitAnswers({ ...answers, [id]: value });
    }
  };

  const submitAnswers = async (allAnswers) => {
    try {
      await axios.post(`${API}/onboarding/submit`, allAnswers, { withCredentials: true });
      setPhase("personalized");
    } catch (e) {
      const detail = e.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Failed to save answers — check your connection");
    }
  };

  const handlePartnerAnswer = (id, value, shouldAdvance) => {
    setPartnerData(prev => ({ ...prev, [id]: value }));
    if (shouldAdvance) {
      if (currentPartnerStep < totalPartnerSteps - 1) {
        setTimeout(() => setCurrentPartnerStep(currentPartnerStep + 1), 200);
      } else {
        setPhase("generating");
      }
    }
  };

  const handleGeneratingComplete = () => {
    setPhase("naming");
  };

  const handlePartnerComplete = async (name) => {
    try {
      const res = await axios.post(`${API}/onboarding/create-partner`, {
        name,
        style: partnerData.training_partner_style,
        focus_areas: partnerData.focus_areas || [],
        accountability_level: partnerData.accountability_level || "moderate"
      }, { withCredentials: true });

      // Try to generate avatar
      try {
        await axios.post(`${API}/onboarding/generate-avatar`, { favorite_fighter: answers.favorite_fighter }, { withCredentials: true });
      } catch (e) {
        console.log("Avatar generation skipped");
      }

      // Update user context
      const userRes = await axios.get(`${API}/auth/me`, { withCredentials: true });
      setUser(userRes.data);

      toast.success(`${name} is ready to train with you!`);
      navigate("/paywall", { replace: true });
    } catch (e) {
      toast.error("Failed to create partner");
    }
  };

  return (
    <div className="min-h-screen bg-victory-bg flex flex-col" data-testid="onboarding-flow">
      {/* Progress Bar */}
      {phase !== "generating" && (
        <header className="p-4 border-b border-victory-border">
          <Progress value={getProgress()} className="h-2" />
        </header>
      )}

      <main className="flex-1 p-6 overflow-y-auto">
        {phase === "affirmation" && (
          <AffirmationPhase
            stats={socialProof.stats}
            testimonials={socialProof.testimonials}
            onNext={() => setPhase("why_hook")}
          />
        )}

        {phase === "why_hook" && (
          <WhyHookPhase
            currentQuestion={currentQuestion}
            answers={answers}
            onAnswer={handleWhyAnswer}
          />
        )}

        {phase === "personalized" && (
          <PersonalizedAffirmation
            answers={answers}
            onNext={() => setPhase("partner")}
          />
        )}

        {phase === "partner" && (
          <PartnerCreationPhase
            styles={partnerStyles}
            currentStep={currentPartnerStep}
            partnerData={partnerData}
            onAnswer={handlePartnerAnswer}
          />
        )}

        {phase === "generating" && (
          <GeneratingScreen
            partnerData={partnerData}
            styles={partnerStyles}
            onComplete={handleGeneratingComplete}
          />
        )}

        {phase === "naming" && (
          <PartnerNamingPhase
            partnerData={partnerData}
            styles={partnerStyles}
            onComplete={handlePartnerComplete}
          />
        )}
      </main>
    </div>
  );
}

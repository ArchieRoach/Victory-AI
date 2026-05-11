import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { toast } from "sonner";
import { ChevronRight, Star, Users, Target, Zap, Check, Quote } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useTranslation } from "react-i18next";

// PHASE 1: AFFIRMATION
const AffirmationPhase = ({ stats, testimonials, onNext }) => {
  const { t } = useTranslation();
  return (
    <div className="animate-fade-in space-y-6">
      <div className="text-center mb-8">
        <img src="/victory-logo.png" alt="Victory AI" className="w-40 h-40 mx-auto mb-4 object-contain" />
        <h1 className="text-2xl font-heading font-extrabold text-victory-text mb-2">
          {t("onboarding.affirmation.title")}
        </h1>
        <p className="text-victory-muted">{t("onboarding.affirmation.subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="victory-card p-4 text-center">
          <p className="font-mono text-2xl font-bold text-victory-lime">{stats?.rounds_recorded || "50,000+"}</p>
          <p className="text-victory-muted text-xs">{t("onboarding.affirmation.roundsRecorded")}</p>
        </div>
        <div className="victory-card p-4 text-center">
          <p className="font-mono text-2xl font-bold text-victory-lime">{stats?.avg_improvement || "34%"}</p>
          <p className="text-victory-muted text-xs">{t("onboarding.affirmation.avgImprovement")}</p>
        </div>
      </div>

      {testimonials && testimonials[0] && (
        <div className="victory-card p-4">
          <Quote className="w-6 h-6 text-victory-lime mb-2" />
          <p className="text-victory-text text-sm italic mb-3">"{testimonials[0].text}"</p>
          <div className="flex items-center justify-between">
            <span className="text-victory-muted text-xs">— {testimonials[0].name}</span>
            <span className="text-victory-lime text-xs font-semibold">{testimonials[0].improvement}</span>
          </div>
        </div>
      )}

      <button onClick={onNext} className="victory-btn-primary flex items-center justify-center gap-2" data-testid="affirmation-next">
        {t("onboarding.affirmation.cta")}
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
};

// PHASE 2: WHY HOOK
const WhyHookPhase = ({ onAnswer, currentQuestion, answers }) => {
  const { t } = useTranslation();

  const getCounterOptions = (stance) => {
    if (stance === "southpaw") {
      return [
        { value: "jab", label: t("onboarding.favorite_counter.jab_southpaw"), icon: "👊" },
        { value: "cross", label: t("onboarding.favorite_counter.cross_southpaw"), icon: "💥" },
        { value: "right_hook", label: t("onboarding.favorite_counter.right_hook"), icon: "🪝" },
        { value: "uppercut", label: t("onboarding.favorite_counter.uppercut"), icon: "⬆️" },
        { value: "body_shot", label: t("onboarding.favorite_counter.body_shot"), icon: "🎯" },
      ];
    }
    return [
      { value: "jab", label: t("onboarding.favorite_counter.jab_orthodox"), icon: "👊" },
      { value: "cross", label: t("onboarding.favorite_counter.cross_orthodox"), icon: "💥" },
      { value: "left_hook", label: t("onboarding.favorite_counter.left_hook"), icon: "🪝" },
      { value: "uppercut", label: t("onboarding.favorite_counter.uppercut"), icon: "⬆️" },
      { value: "body_shot", label: t("onboarding.favorite_counter.body_shot"), icon: "🎯" },
    ];
  };

  const questions = [
    {
      id: "why_downloaded",
      question: t("onboarding.why_downloaded.question"),
      subtitle: t("onboarding.why_downloaded.subtitle"),
      options: [
        { value: "improve_technique", label: t("onboarding.why_downloaded.improve_technique"), icon: "🎯" },
        { value: "get_feedback", label: t("onboarding.why_downloaded.get_feedback"), icon: "👀" },
        { value: "stay_consistent", label: t("onboarding.why_downloaded.stay_consistent"), icon: "📅" },
        { value: "prepare_fight", label: t("onboarding.why_downloaded.prepare_fight"), icon: "🥊" },
        { value: "just_curious", label: t("onboarding.why_downloaded.just_curious"), icon: "🤔" },
      ],
    },
    {
      id: "heard_from",
      question: t("onboarding.heard_from.question"),
      subtitle: t("onboarding.heard_from.subtitle"),
      options: [
        { value: "social_media", label: t("onboarding.heard_from.social_media"), icon: "📱" },
        { value: "youtube", label: t("onboarding.heard_from.youtube"), icon: "▶️" },
        { value: "friend", label: t("onboarding.heard_from.friend"), icon: "👥" },
        { value: "search", label: t("onboarding.heard_from.search"), icon: "🔍" },
        { value: "other", label: t("onboarding.heard_from.other"), icon: "🌐" },
      ],
    },
    {
      id: "biggest_frustration",
      question: t("onboarding.biggest_frustration.question"),
      subtitle: t("onboarding.biggest_frustration.subtitle"),
      options: [
        { value: "no_feedback", label: t("onboarding.biggest_frustration.no_feedback"), icon: "🤷" },
        { value: "bad_habits", label: t("onboarding.biggest_frustration.bad_habits"), icon: "🔄" },
        { value: "defense_weak", label: t("onboarding.biggest_frustration.defense_weak"), icon: "🛡️" },
        { value: "no_power", label: t("onboarding.biggest_frustration.no_power"), icon: "💪" },
        { value: "footwork", label: t("onboarding.biggest_frustration.footwork"), icon: "👣" },
      ],
    },
    {
      id: "training_frequency",
      question: t("onboarding.training_frequency.question"),
      options: [
        { value: "daily", label: t("onboarding.training_frequency.daily"), icon: "🔥" },
        { value: "3-4_week", label: t("onboarding.training_frequency.3-4_week"), icon: "💪" },
        { value: "1-2_week", label: t("onboarding.training_frequency.1-2_week"), icon: "📅" },
        { value: "inconsistent", label: t("onboarding.training_frequency.inconsistent"), icon: "🎲" },
        { value: "just_starting", label: t("onboarding.training_frequency.just_starting"), icon: "🌱" },
      ],
    },
    {
      id: "experience_level",
      question: t("onboarding.experience_level.question"),
      options: [
        { value: "complete_beginner", label: t("onboarding.experience_level.complete_beginner"), icon: "🌱" },
        { value: "under_6_months", label: t("onboarding.experience_level.under_6_months"), icon: "📆" },
        { value: "6_18_months", label: t("onboarding.experience_level.6_18_months"), icon: "💪" },
        { value: "1_3_years", label: t("onboarding.experience_level.1_3_years"), icon: "🥊" },
        { value: "3_plus_years", label: t("onboarding.experience_level.3_plus_years"), icon: "🏆" },
      ],
    },
    {
      id: "boxing_stance",
      question: t("onboarding.boxing_stance.question"),
      subtitle: t("onboarding.boxing_stance.subtitle"),
      options: [
        { value: "orthodox", label: t("onboarding.boxing_stance.orthodox"), icon: "🥊" },
        { value: "southpaw", label: t("onboarding.boxing_stance.southpaw"), icon: "🔄" },
        { value: "switch", label: t("onboarding.boxing_stance.switch"), icon: "⚡" },
        { value: "not_sure", label: t("onboarding.boxing_stance.not_sure"), icon: "🤔" },
      ],
    },
    {
      id: "favorite_counter",
      question: t("onboarding.favorite_counter.question"),
      subtitle: t("onboarding.favorite_counter.subtitle"),
      options: getCounterOptions(answers.boxing_stance),
    },
    {
      id: "favorite_fighter",
      question: t("onboarding.favorite_fighter.question"),
      subtitle: t("onboarding.favorite_fighter.subtitle"),
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
        <h1 className="text-xl font-heading font-extrabold text-victory-text mb-1">{q.question}</h1>
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
  const { t } = useTranslation();

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
      honesty: "Real talk: the first two weeks feel slow. But by week 3, you'll wonder how you trained without this.",
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
          {t("onboarding.personalized.title")}
        </h1>
      </div>

      <div className="space-y-4">
        <div className="victory-card p-4 border-l-4 border-victory-lime">
          <p className="text-victory-text">{aff.main}</p>
        </div>
        <div className="victory-card p-4 border-l-4 border-victory-teal">
          <p className="text-victory-muted text-sm mb-1">{t("onboarding.personalized.realisticGoal")}</p>
          <p className="text-victory-text font-semibold">{aff.counter} {t("onboarding.personalized.withinWeeks")}</p>
        </div>
        <div className="victory-card p-4 border-l-4 border-victory-orange">
          <p className="text-victory-muted text-sm mb-1">{t("onboarding.personalized.honestExpectation")}</p>
          <p className="text-victory-text text-sm">{aff.honesty}</p>
        </div>
      </div>

      <button onClick={onNext} className="victory-btn-primary flex items-center justify-center gap-2" data-testid="affirmation-continue">
        {t("onboarding.personalized.cta")}
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
};

// PHASE 4: PARTNER CREATION
const PartnerCreationPhase = ({ styles, onAnswer, currentStep, partnerData }) => {
  const { t } = useTranslation();

  const steps = [
    {
      id: "training_partner_style",
      question: t("onboarding.partner_style.question"),
      subtitle: t("onboarding.partner_style.subtitle"),
      options: Object.entries(styles || {}).map(([key, style]) => ({
        value: key,
        label: style.name,
        description: style.personality,
        icon: key === "tough_love" ? "💪" : key === "hype_man" ? "🔥" : key === "analytical_technician" ? "🧠" : key === "old_school_trainer" ? "🎖️" : "❤️",
      })),
    },
    {
      id: "accountability_level",
      question: t("onboarding.accountability_level.question"),
      subtitle: t("onboarding.accountability_level.subtitle"),
      options: [
        { value: "gentle", label: t("onboarding.accountability_level.gentle"), description: t("onboarding.accountability_level.gentle_desc"), icon: "🌱" },
        { value: "moderate", label: t("onboarding.accountability_level.moderate"), description: t("onboarding.accountability_level.moderate_desc"), icon: "⚖️" },
        { value: "high", label: t("onboarding.accountability_level.high"), description: t("onboarding.accountability_level.high_desc"), icon: "🔥" },
      ],
    },
    {
      id: "focus_areas",
      question: t("onboarding.focus_areas.question"),
      subtitle: t("onboarding.focus_areas.subtitle"),
      multiSelect: true,
      maxSelect: 2,
      options: [
        { value: "Guard Position", label: t("onboarding.focus_areas.Guard Position"), icon: "🛡️" },
        { value: "Head Movement", label: t("onboarding.focus_areas.Head Movement"), icon: "↔️" },
        { value: "Footwork", label: t("onboarding.focus_areas.Footwork"), icon: "👣" },
        { value: "Combination Flow", label: t("onboarding.focus_areas.Combination Flow"), icon: "💥" },
        { value: "Punch Accuracy", label: t("onboarding.focus_areas.Punch Accuracy"), icon: "🎯" },
        { value: "Defense overall", label: t("onboarding.focus_areas.Defense overall"), icon: "🥋" },
      ],
    },
  ];

  const step = steps[currentStep];
  if (!step) return null;

  const selectedValues = step.multiSelect ? (partnerData[step.id] || []) : partnerData[step.id];

  const handleSelect = (value) => {
    if (step.multiSelect) {
      const current = partnerData[step.id] || [];
      if (current.includes(value)) {
        onAnswer(step.id, current.filter((v) => v !== value), false);
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
        <h1 className="text-xl font-heading font-extrabold text-victory-text mb-1">{step.question}</h1>
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
          {t("common.continue")}
          <ChevronRight className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};

// PHASE 5: GENERATING SCREEN
const GeneratingScreen = ({ partnerData, styles, onComplete }) => {
  const { t } = useTranslation();
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    t("onboarding.generating.step0"),
    t("onboarding.generating.step1"),
    t("onboarding.generating.step2"),
    t("onboarding.generating.step3"),
    t("onboarding.generating.step4"),
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(onComplete, 500);
          return 100;
        }
        return prev + 2;
      });
    }, 80);

    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
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
        {t("onboarding.generating.title", { style: styleName })}
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
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const styleName = styles?.[partnerData.training_partner_style]?.name || "Training Partner";
  const personality = styles?.[partnerData.training_partner_style]?.personality || "";

  const suggestedNames = ["Rocky", "Coach", "Champ", "Ace", "Iron", "Flash", "Duke", "Max"];

  const handleComplete = async () => {
    if (!name.trim()) {
      toast.error(t("onboarding.naming.errorName"));
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
          {t("onboarding.naming.title", { style: styleName })}
        </h1>
        <p className="text-victory-muted text-sm">{personality}</p>
      </div>

      <div>
        <label className="victory-label">{t("onboarding.naming.nameLabel")}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("onboarding.naming.namePlaceholder")}
          className="victory-input text-center text-xl"
          data-testid="partner-name-input"
        />
      </div>

      <div>
        <p className="text-victory-muted text-xs mb-2">{t("onboarding.naming.orPick")}</p>
        <div className="flex flex-wrap gap-2">
          {suggestedNames.map((n) => (
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
            {t("onboarding.naming.meetPartner", { name: name || "Your Partner" })}
            <ChevronRight className="w-5 h-5" />
          </>
        )}
      </button>
    </div>
  );
};

// PHASE 7: PLAN BUILDING
const PlanBuildingScreen = ({ partnerName, answers, onComplete }) => {
  const { t } = useTranslation();
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);

  const focus = answers?.focus_areas?.join(" & ") || "technique";
  const level = answers?.experience_level?.replace(/_/g, " ") || "your level";
  const frustration = answers?.biggest_frustration?.replace(/_/g, " ") || "goals";

  const planSteps = [
    t("onboarding.planBuilding.step0", { name: partnerName || "your partner" }),
    t("onboarding.planBuilding.step1"),
    t("onboarding.planBuilding.step2", { frustration }),
    t("onboarding.planBuilding.step3"),
    t("onboarding.planBuilding.step4"),
    t("onboarding.planBuilding.step5"),
  ];

  const planItems = [
    t("onboarding.planBuilding.item_drills", { focus }),
    t("onboarding.planBuilding.item_feedback", { name: partnerName || "Your partner" }),
    t("onboarding.planBuilding.item_progression"),
    t("onboarding.planBuilding.item_tracking"),
  ];

  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          setTimeout(onComplete, 800);
          return 100;
        }
        return prev + 1.5;
      });
    }, 60);

    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => Math.min(prev + 1, planSteps.length - 1));
    }, 700);

    return () => {
      clearInterval(progressInterval);
      clearInterval(stepInterval);
    };
  }, [onComplete]);

  return (
    <div className="animate-fade-in flex flex-col items-center justify-center min-h-[70vh] px-4">
      <div className="w-20 h-20 rounded-full bg-victory-lime/10 flex items-center justify-center mb-6 relative">
        <div className="w-16 h-16 rounded-full border-4 border-victory-lime border-t-transparent animate-spin absolute" />
        <Target className="w-8 h-8 text-victory-lime" />
      </div>

      <h2 className="text-2xl font-heading font-extrabold text-victory-text mb-1 text-center">
        {t("onboarding.planBuilding.title")}
      </h2>
      <p className="text-victory-muted text-sm mb-6 text-center">
        {t("onboarding.planBuilding.subtitle", { level })}
      </p>

      <p className="text-victory-lime text-sm mb-8 text-center h-5 animate-pulse">
        {planSteps[currentStep]}
      </p>

      <div className="w-full max-w-xs mb-6">
        <Progress value={progress} className="h-3" />
        <p className="text-victory-muted text-xs text-center mt-1">{Math.round(progress)}%</p>
      </div>

      <div className="w-full max-w-xs victory-card p-4 space-y-2">
        <p className="text-victory-muted text-xs font-semibold uppercase tracking-wide mb-3">
          {t("onboarding.planBuilding.includes")}
        </p>
        {planItems.map((item, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 text-sm transition-opacity duration-500 ${i <= currentStep ? "opacity-100" : "opacity-20"}`}
          >
            <div className="w-4 h-4 rounded-full bg-victory-lime/20 flex items-center justify-center flex-shrink-0">
              <Check className="w-2.5 h-2.5 text-victory-lime" />
            </div>
            <span className="text-victory-text">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// MAIN COMPONENT
export default function OnboardingFlow() {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const { t } = useTranslation();

  const [phase, setPhase] = useState("affirmation");
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [currentPartnerStep, setCurrentPartnerStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [partnerData, setPartnerData] = useState({});
  const [createdPartnerName, setCreatedPartnerName] = useState("");
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
    setAnswers((prev) => ({ ...prev, [id]: value }));
    if (currentQuestion < totalQuestions - 1) {
      setTimeout(() => setCurrentQuestion(currentQuestion + 1), 200);
    } else {
      submitAnswers({ ...answers, [id]: value });
    }
  };

  const submitAnswers = async (allAnswers) => {
    try {
      await axios.post(`${API}/onboarding/submit`, allAnswers, { withCredentials: true });
      setPhase("personalized");
    } catch (e) {
      const detail = e.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : t("onboarding.failedSave"));
    }
  };

  const handlePartnerAnswer = (id, value, shouldAdvance) => {
    setPartnerData((prev) => ({ ...prev, [id]: value }));
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
      await axios.post(
        `${API}/onboarding/create-partner`,
        {
          name,
          style: partnerData.training_partner_style,
          focus_areas: partnerData.focus_areas || [],
          accountability_level: partnerData.accountability_level || "moderate",
        },
        { withCredentials: true }
      );

      axios.post(`${API}/onboarding/generate-avatar`, { favorite_fighter: answers.favorite_fighter }, { withCredentials: true }).catch(() => {});

      setCreatedPartnerName(name);
      setPhase("plan_building");
    } catch (e) {
      toast.error(t("onboarding.failedPartner"));
    }
  };

  const handlePlanBuildingComplete = async () => {
    try {
      const userRes = await axios.get(`${API}/auth/me`, { withCredentials: true });
      setUser(userRes.data);
    } catch (e) {}
    toast.success(t("onboarding.partnerReady", { name: createdPartnerName }));
    navigate("/paywall", { replace: true });
  };

  return (
    <div className="min-h-screen bg-victory-bg flex flex-col" data-testid="onboarding-flow">
      {phase !== "generating" && phase !== "plan_building" && (
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
          <PersonalizedAffirmation answers={answers} onNext={() => setPhase("partner")} />
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

        {phase === "plan_building" && (
          <PlanBuildingScreen
            partnerName={createdPartnerName}
            answers={answers}
            onComplete={handlePlanBuildingComplete}
          />
        )}
      </main>
    </div>
  );
}

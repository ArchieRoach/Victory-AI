import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { whyWeAsk } from "@/lib/onboardingWhy";
import { GOALS } from "@/lib/goals";
import { labelLines, planLines } from "@/lib/onboardingPitch";
import { withCue } from "@/lib/verbalCues";

const GOAL_ICONS = ["🏃", "📈", "🛡️", "⚡", "🥊", "🏆", "😄"];
import axios from "axios";
import { API, useAuth } from "@/App";
import { toast } from "sonner";
import { ChevronRight, ChevronLeft, Star, Users, Target, Zap, Check } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useTranslation } from "react-i18next";
import { withMinDuration } from "@/utils/async";

// PHASE 0: BIRTH DATE (age gate — GDPR Art. 8 minimum digital-consent age)
const BirthDatePhase = ({ onNext }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [birthDate, setBirthDate] = useState("");

  const handleContinue = () => {
    if (!birthDate) return toast.error(t("onboarding.birth_date.required"));
    const age = Math.floor((Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    if (age < 13) return toast.error(t("onboarding.birth_date.under13"));
    onNext(birthDate);
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="mb-6">
        <h1 className="text-xl font-heading font-extrabold text-victory-text mb-1">{t("onboarding.birth_date.question")}</h1>
        <p className="text-victory-muted text-sm">{t("onboarding.birth_date.subtitle")}</p>
      </div>
      <input
        type="date"
        value={birthDate}
        onChange={(e) => setBirthDate(e.target.value)}
        max={new Date().toISOString().split("T")[0]}
        className="victory-input"
        data-testid="birth-date-input"
      />
      <button onClick={handleContinue} className="victory-btn-primary flex items-center justify-center gap-2" data-testid="birth-date-continue">
        {t("onboarding.birth_date.cta")}
        <ChevronRight className="w-5 h-5" />
      </button>
      <p className="text-victory-muted text-xs text-center leading-relaxed">
        {t("onboarding.birth_date.legalPrefix")}{" "}
        <button onClick={() => navigate("/terms")} className="text-victory-lime underline touch-target">
          {t("profile.termsOfService")}
        </button>{" "}
        {t("common.and")}{" "}
        <button onClick={() => navigate("/privacy")} className="text-victory-lime underline touch-target">
          {t("profile.privacyPolicy")}
        </button>.
      </p>
    </div>
  );
};

// PHASE 1: AFFIRMATION
const AffirmationPhase = ({ stats, onNext }) => {
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

      {/* Social proof only when it's real: live counts from the server, shown once they're
          big enough to mean something. No invented numbers or testimonials. */}
      {stats?.rounds_recorded && stats?.fighters && (
        <div className="grid grid-cols-2 gap-3" data-testid="real-social-proof">
          <div className="victory-card p-4 text-center">
            <p className="font-mono text-2xl font-bold text-victory-lime">{stats.rounds_recorded}</p>
            <p className="text-victory-muted text-xs">{t("onboarding.affirmation.roundsRecorded")}</p>
          </div>
          <div className="victory-card p-4 text-center">
            <p className="font-mono text-2xl font-bold text-victory-lime">{stats.fighters}</p>
            <p className="text-victory-muted text-xs">fighters training</p>
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
const WhyHookPhase = ({ onAnswer, onBack, currentQuestion, answers, submitting }) => {
  const { t } = useTranslation();

  // C: clarify why they're here first; O: then what's held them back.
  const questions = [
    {
      id: "primary_goal",
      question: "What brings you to Victory AI?",
      subtitle: "Pick the one that matters most right now.",
      options: GOALS.map((g, i) => ({ value: g, label: g, icon: GOAL_ICONS[i] })),
    },
    {
      id: "biggest_frustration",
      question: "What's held you back so far?",
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

  const questionsLeft = questions.length - currentQuestion;

  return (
    <div className="animate-fade-in">
      {currentQuestion > 0 && (
        <button
          onClick={onBack}
          className="text-victory-muted text-sm flex items-center gap-1 touch-target -ml-2 mb-1 hover:text-victory-text"
        >
          <ChevronLeft className="w-4 h-4" /> {t("common.back", "Back")}
        </button>
      )}
      <div className="mb-6">
        <p className="text-victory-lime text-xs font-bold uppercase tracking-wider mb-2">
          {questionsLeft === 1
            ? t("onboarding.lastQuestion")
            : t("onboarding.questionOf", { current: currentQuestion + 1, total: questions.length })}
        </p>
        <h1 className="text-xl font-heading font-extrabold text-victory-text mb-1">{q.question}</h1>
        {q.subtitle && <p className="text-victory-muted text-sm">{q.subtitle}</p>}
        <WhyLine text={whyWeAsk(q.id, answers)} />
      </div>

      <div className="space-y-3">
        {q.options.map((option) => (
          <button
            key={option.value}
            onClick={() => onAnswer(q.id, option.value)}
            disabled={submitting}
            className="w-full p-4 rounded-lg border bg-victory-card border-victory-border text-left flex items-center gap-4 touch-target transition-all hover:border-victory-lime active:scale-[0.98] disabled:opacity-50"
            data-testid={`option-${option.value}`}
          >
            <span className="text-2xl">{option.icon}</span>
            <span className="text-victory-text font-medium">{option.label}</span>
          </button>
        ))}
      </div>

      {submitting && (
        <div className="flex items-center justify-center gap-2 mt-4 text-victory-muted text-sm animate-fade-in">
          <span className="w-4 h-4 border-2 border-victory-lime border-t-transparent rounded-full animate-spin" />
          {t("onboarding.settingUp")}
        </div>
      )}
    </div>
  );
};

function WhyLine({ text }) {
  if (!text) return null;
  return <p className="text-victory-muted text-xs mt-2 flex items-start gap-1.5" data-testid="why-we-ask"><span aria-hidden="true" className="text-victory-lime">•</span>{text}</p>;
}

// PHASE 3: PERSONALIZED AFFIRMATION
const PersonalizedAffirmation = ({ answers, onNext, onEdit }) => {
  const { t } = useTranslation();

  // Goal: the fighter finishes onboarding feeling capable, and believes what we say.
  // Psychology: competence (Self-Determination Theory) and the labelling effect: reflect back
  //   something smart they actually did (named their weak spot, picked a role model) rather
  //   than promising results. Honest expectations beat hype for trust.
  // Design: three short cards built only from their own answers.
  const getAffirmation = () => {
    const frustration = answers.biggest_frustration;
    const fighter = answers.favorite_fighter;

    const weakSpot = {
      no_feedback: "real feedback",
      bad_habits: "bad habits",
      defense_weak: "defence",
      no_power: "power",
      footwork: "footwork",
    };

    // What each fighter is known for, so the pick reads as boxing knowledge, not trivia.
    const fighterSkill = {
      "Muhammad Ali": "his jab and footwork",
      "Mike Tyson": "head movement before every attack",
      "Floyd Mayweather": "defence: making people miss",
      "Terence Crawford": "switching stance mid-fight",
      "Usyk": "footwork and angles",
      "Canelo Alvarez": "counter-punching and body work",
      "Manny Pacquiao": "hand speed and angles",
      "Artur Beterbiev": "pressure and heavy shots",
      "Roberto Duran": "fighting on the inside",
    };

    const level = answers.experience_level;
    const start = level === "complete_beginner"
      ? "Starting from zero is fine. Your first rounds are short and simple, and new tools unlock as you train."
      : "You already know your way around a round, so your partner will skip the basics you don't need.";

    const skill = fighterSkill[fighter];
    return {
      main: weakSpot[frustration]
        ? `You named your weak spot: ${weakSpot[frustration]}. Knowing exactly what to fix is how good boxers train.`
        : "Your partner will focus on exactly what you need.",
      fighter: skill
        ? `${fighter} was famous for ${skill}. Your partner will point it out when you do it too.`
        : "Your partner will point out what you do well, not just what to fix.",
      honesty: start,
    };
  };

  const aff = getAffirmation();
  const label = labelLines(answers);

  return (
    <div className="animate-fade-in space-y-5">
      {/* L: say it back as a question (NEPQ verbal cue first), O: it's not their fault. */}
      <div className="victory-card p-4 space-y-2 border-victory-lime/40" data-testid="label-reflect">
        <p className="section-label">Your partner</p>
        <p className="text-victory-text text-lg font-heading font-bold leading-snug">
          {withCue(label.reflect, `label:${answers.primary_goal}`)}
        </p>
      </div>
      <div className="victory-card p-4 border-l-4 border-victory-teal">
        <p className="text-victory-text text-sm">{label.notYourFault}</p>
      </div>
      <div className="victory-card p-4 border-l-4 border-victory-orange space-y-2">
        <p className="text-victory-text text-sm">{aff.fighter}</p>
        <p className="text-victory-muted text-sm">{aff.honesty}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={onEdit} className="victory-btn-ghost min-h-[48px]" data-testid="label-not-quite">Not quite</button>
        <button onClick={onNext} className="victory-btn-primary min-h-[48px] flex items-center justify-center gap-1" data-testid="affirmation-continue">
          That's me <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// PHASE 4: PARTNER CREATION
const PartnerCreationPhase = ({ styles, onAnswer, onBack, currentStep, partnerData, answers = {} }) => {
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
      {currentStep > 0 && (
        <button
          onClick={onBack}
          className="text-victory-muted text-sm flex items-center gap-1 touch-target -ml-2 mb-1 hover:text-victory-text"
        >
          <ChevronLeft className="w-4 h-4" /> {t("common.back", "Back")}
        </button>
      )}
      <div className="mb-6">
        <h1 className="text-xl font-heading font-extrabold text-victory-text mb-1">{step.question}</h1>
        {step.subtitle && <p className="text-victory-muted text-sm">{step.subtitle}</p>}
        <WhyLine text={whyWeAsk(step.id, answers)} />
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
  const [look, setLook] = useState(null);
  const [loading, setLoading] = useState(false);

  const styleName = styles?.[partnerData.training_partner_style]?.name || "Training Partner";
  // First-person, in-character line (not the third-person `personality` blurb used earlier
  // in the flow) — shown right as the fighter is about to name their partner, the one real
  // bonding moment in this flow. First-person narration is what makes a reader/user
  // identify with a character (experience-taking), so the partner introduces itself here
  // rather than being described.
  const introLine = styles?.[partnerData.training_partner_style]?.intro_line
    || styles?.[partnerData.training_partner_style]?.personality || "";

  const suggestedNames = ["Rocky", "Coach", "Champ", "Ace", "Iron", "Flash", "Duke", "Max"];

  const handleComplete = async () => {
    if (!name.trim()) {
      toast.error(t("onboarding.naming.errorName"));
      return;
    }
    setLoading(true);
    try {
      await onComplete(name, look);
    } finally {
      // Reset so a failed create-partner call doesn't leave the button stuck spinning.
      setLoading(false);
    }
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
        <p className="text-victory-muted text-sm italic">"{introLine}"</p>
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

      {/* Their partner's picture was a coin toss before; who you train with is your call. */}
      <div>
        <p className="victory-label">Your partner is</p>
        <div className="flex gap-2" role="radiogroup" aria-label="Your partner is">
          {[["male", "A man"], ["female", "A woman"]].map(([value, label]) => (
            <button
              key={value}
              role="radio"
              aria-checked={look === value}
              onClick={() => setLook(value)}
              className={`touch-target flex-1 rounded-full text-sm font-semibold transition-colors ${
                look === value ? "bg-victory-lime text-victory-bg" : "bg-victory-card border border-victory-border text-victory-text"
              }`}
              data-testid={`partner-look-${value}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-victory-muted text-xs mb-2">{t("onboarding.naming.orPick")}</p>
        <div className="flex flex-wrap gap-2">
          {suggestedNames.map((n) => (
            <button
              key={n}
              onClick={() => setName(n)}
              className={`touch-target px-3 flex items-center justify-center rounded-full text-sm transition-colors ${
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
        disabled={!name.trim() || !look || loading}
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

// S: sell the destination, not the plane ride. Their plan, in their words, made only of things
// the app really does. The paywall then reads as "how to unlock this", not a toll booth.
const YourPlanScreen = ({ partnerName, answers, onNext }) => {
  const plan = planLines(answers, partnerName || "Your partner");
  return (
    <div className="animate-fade-in space-y-5" data-testid="your-plan">
      <div>
        <p className="section-label">Ready</p>
        <h1 className="text-2xl font-heading font-extrabold text-victory-text leading-tight">{plan.headline}</h1>
      </div>
      <ol className="space-y-3">
        {plan.steps.map((step) => (
          <li key={step.when} className="victory-card p-4">
            <p className="text-victory-lime text-xs font-heading font-bold uppercase tracking-wide">{step.when}</p>
            <p className="text-victory-text text-sm mt-1">{step.what}</p>
          </li>
        ))}
      </ol>
      <p className="text-victory-muted text-sm">
        {withCue(`So, ${partnerName || "your partner"} is ready when you are. Want to see how to get all of it?`, `plan:${partnerName}`)}
      </p>
      <button onClick={onNext} className="victory-btn-primary flex items-center justify-center gap-2" data-testid="see-plan-options">
        Show me <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
};

// A phone lock, backgrounding, or accidental refresh mid-onboarding used to restart
// this whole multi-minute, multi-question flow from the birth-date screen with
// everything lost (Tesler's Law: real people get interrupted, an idealized "never
// backgrounds the tab" user doesn't exist). Mirrors the draft-persistence pattern
// already used in ScorePage.jsx/TrainPage.jsx.
const ONBOARDING_DRAFT_KEY = "victory_onboarding_draft";
// Never resume directly into a transitional/async phase — land on the last stable
// step instead so nothing (partner creation, avatar generation) double-fires.
const RESUMABLE_PHASES = new Set(["why_hook", "personalized", "partner"]);

// MAIN COMPONENT
export default function OnboardingFlow() {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const { t } = useTranslation();

  const [phase, setPhase] = useState("birth_date");
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [currentPartnerStep, setCurrentPartnerStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [partnerData, setPartnerData] = useState({});
  const [createdPartnerName, setCreatedPartnerName] = useState("");
  const [submittingAnswers, setSubmittingAnswers] = useState(false);
  const [socialProof, setSocialProof] = useState({ stats: {}, testimonials: [] });
  const [partnerStyles, setPartnerStyles] = useState({});

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(ONBOARDING_DRAFT_KEY) || "null");
      if (saved && RESUMABLE_PHASES.has(saved.phase)) {
        setPhase(saved.phase);
        setCurrentQuestion(saved.currentQuestion || 0);
        setCurrentPartnerStep(saved.currentPartnerStep || 0);
        setAnswers(saved.answers || {});
        setPartnerData(saved.partnerData || {});
      }
    } catch {}
    fetchSocialProof();
    fetchPartnerStyles();
  }, []);

  // Debounced-by-nature (just a cheap sync write on every relevant change) — this
  // is small draft data, no need for ScorePage's setTimeout debounce.
  useEffect(() => {
    if (!RESUMABLE_PHASES.has(phase)) return;
    sessionStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify({ phase, currentQuestion, currentPartnerStep, answers, partnerData }));
  }, [phase, currentQuestion, currentPartnerStep, answers, partnerData]);

  const fetchSocialProof = async () => {
    try {
      const res = await axios.get(`${API}/onboarding/social-proof`, { withCredentials: true });
      setSocialProof(res.data);
    } catch (e) {
      console.error("Failed to fetch social proof:", e);
    }
  };

  const fetchPartnerStyles = async () => {
    try {
      const res = await axios.get(`${API}/onboarding/partner-styles`, { withCredentials: true });
      setPartnerStyles(res.data.styles);
    } catch (e) {
      console.error("Failed to fetch partner styles:", e);
      toast.error("Couldn't load training partner styles — try again");
    }
  };

  const totalQuestions = 4;
  const totalPartnerSteps = 2;

  const getProgress = () => {
    if (phase === "birth_date") return 2;
    if (phase === "affirmation") return 5;
    if (phase === "why_hook") return 10 + (currentQuestion / totalQuestions) * 40;
    if (phase === "personalized") return 55;
    if (phase === "partner") return 60 + (currentPartnerStep / totalPartnerSteps) * 25;
    if (phase === "generating") return 90;
    if (phase === "naming") return 95;
    if (phase === "your_plan") return 100;
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

  const handleWhyBack = () => setCurrentQuestion((q) => Math.max(0, q - 1));

  const submitAnswers = async (allAnswers) => {
    if (submittingAnswers) return; // ignore double-taps on the last question
    setSubmittingAnswers(true);
    try {
      await withMinDuration(axios.post(`${API}/onboarding/submit`, allAnswers, { withCredentials: true }));
      setPhase("personalized");
    } catch (e) {
      const detail = e.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : t("onboarding.failedSave"));
    } finally {
      setSubmittingAnswers(false);
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

  const handlePartnerBack = () => setCurrentPartnerStep((s) => Math.max(0, s - 1));

  const handleGeneratingComplete = () => {
    setPhase("naming");
  };

  const handlePartnerComplete = async (name, look) => {
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

      axios.post(`${API}/onboarding/generate-avatar`, { favorite_fighter: answers.favorite_fighter, gender: look }, { withCredentials: true }).catch(() => {});

      sessionStorage.removeItem(ONBOARDING_DRAFT_KEY);
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
    setPhase("your_plan");
  };

  return (
    <div className="min-h-screen bg-victory-bg flex flex-col" data-testid="onboarding-flow">
      {phase !== "generating" && phase !== "plan_building" && (
        <header className="p-4 border-b border-victory-border">
          <Progress value={getProgress()} className="h-2" />
          {/* Goal gradient effect: only nudge in the final stretch — motivation
              from proximity matters most right before the finish, not throughout. */}
          {getProgress() >= 85 && (
            <p className="text-victory-lime text-xs font-semibold mt-2 text-center">
              {t("onboarding.almostThere")}
            </p>
          )}
        </header>
      )}

      <main className="flex-1 p-6 overflow-y-auto">
        {phase === "birth_date" && (
          <BirthDatePhase
            onNext={(birthDate) => {
              setAnswers((prev) => ({ ...prev, birth_date: birthDate }));
              setPhase("affirmation");
            }}
          />
        )}

        {phase === "affirmation" && (
          <AffirmationPhase
            stats={socialProof.stats}
            onNext={() => setPhase("why_hook")}
          />
        )}

        {phase === "why_hook" && (
          <WhyHookPhase
            currentQuestion={currentQuestion}
            answers={answers}
            onAnswer={handleWhyAnswer}
            onBack={handleWhyBack}
            submitting={submittingAnswers}
          />
        )}

        {phase === "personalized" && (
          <PersonalizedAffirmation answers={answers} onNext={() => setPhase("partner")}
            onEdit={() => { setCurrentQuestion(0); setPhase("why_hook"); }} />
        )}

        {phase === "partner" && (
          <PartnerCreationPhase
            styles={partnerStyles}
            currentStep={currentPartnerStep}
            partnerData={partnerData}
            onAnswer={handlePartnerAnswer}
            onBack={handlePartnerBack}
            answers={answers}
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

        {phase === "your_plan" && (
          <YourPlanScreen partnerName={createdPartnerName} answers={answers}
            onNext={() => navigate("/paywall", { replace: true })} />
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

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { toast } from "sonner";
import { ChevronRight, ChevronLeft, Check } from "lucide-react";
import { Progress } from "@/components/ui/progress";

const QUIZ_QUESTIONS = [
  {
    id: "training_goal",
    question: "What are you training for?",
    options: [
      { value: "Get fit", label: "Get fit", icon: "💪" },
      { value: "Compete", label: "Compete in fights", icon: "🥊" },
      { value: "Prepare for sparring", label: "Prepare for sparring", icon: "🎯" },
      { value: "Lose weight", label: "Lose weight", icon: "⚡" },
      { value: "Just having fun", label: "Just having fun", icon: "😄" },
    ],
  },
  {
    id: "training_frequency",
    question: "How often do you train?",
    options: [
      { value: "1-2 times/week", label: "1-2 times per week", icon: "📅" },
      { value: "3-4 times/week", label: "3-4 times per week", icon: "🔥" },
      { value: "5+ times/week", label: "5+ times per week", icon: "💯" },
      { value: "Just starting", label: "Just starting out", icon: "🌱" },
    ],
  },
  {
    id: "training_location",
    question: "Where do you train most?",
    options: [
      { value: "Gym", label: "Boxing gym", icon: "🏋️" },
      { value: "Home", label: "At home", icon: "🏠" },
      { value: "Outside", label: "Outside / park", icon: "🌳" },
      { value: "Mixed", label: "Mix of places", icon: "🔄" },
    ],
  },
  {
    id: "biggest_frustration",
    question: "What's your biggest frustration?",
    options: [
      { value: "No feedback", label: "No one to give me feedback", icon: "👀" },
      { value: "Inconsistent", label: "Inconsistent training", icon: "📉" },
      { value: "Dont know what to work on", label: "Don't know what to work on", icon: "❓" },
      { value: "Technique issues", label: "Can't fix technique issues", icon: "🔧" },
    ],
  },
  {
    id: "favorite_fighters",
    question: "Which fighters inspire you?",
    subtitle: "Pick up to 3",
    multiSelect: true,
    maxSelect: 3,
    options: [
      { value: "Usyk", label: "Oleksandr Usyk", icon: "🇺🇦" },
      { value: "Tyson", label: "Mike Tyson", icon: "🦾" },
      { value: "Mayweather", label: "Floyd Mayweather", icon: "💰" },
      { value: "Pacquiao", label: "Manny Pacquiao", icon: "⚡" },
      { value: "Ali", label: "Muhammad Ali", icon: "👑" },
      { value: "Canelo", label: "Canelo Alvarez", icon: "🇲🇽" },
      { value: "Crawford", label: "Terence Crawford", icon: "🎯" },
      { value: "Inoue", label: "Naoya Inoue", icon: "🇯🇵" },
    ],
  },
];

export default function OnboardingQuiz() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({
    training_goal: "",
    training_frequency: "",
    training_location: "",
    biggest_frustration: "",
    favorite_fighters: [],
  });
  const [loading, setLoading] = useState(false);

  const question = QUIZ_QUESTIONS[currentQuestion];
  const progress = ((currentQuestion + 1) / QUIZ_QUESTIONS.length) * 100;

  const handleSelect = (value) => {
    if (question.multiSelect) {
      const current = answers[question.id] || [];
      if (current.includes(value)) {
        setAnswers({
          ...answers,
          [question.id]: current.filter((v) => v !== value),
        });
      } else if (current.length < (question.maxSelect || 3)) {
        setAnswers({
          ...answers,
          [question.id]: [...current, value],
        });
      }
    } else {
      setAnswers({ ...answers, [question.id]: value });
      // Auto-advance for single select
      setTimeout(() => handleNext(), 300);
    }
  };

  const handleNext = async () => {
    if (currentQuestion < QUIZ_QUESTIONS.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      // Submit quiz
      setLoading(true);
      try {
        await axios.post(`${API}/quiz/submit`, answers, {
          withCredentials: true,
        });
        navigate("/onboarding/fighter", { replace: true });
      } catch (error) {
        toast.error("Failed to save quiz answers");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleBack = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const isSelected = (value) => {
    if (question.multiSelect) {
      return (answers[question.id] || []).includes(value);
    }
    return answers[question.id] === value;
  };

  const canProceed = () => {
    if (question.multiSelect) {
      return (answers[question.id] || []).length > 0;
    }
    return answers[question.id] !== "";
  };

  return (
    <div
      className="min-h-screen bg-victory-bg flex flex-col"
      data-testid="onboarding-quiz"
    >
      {/* Header with Progress */}
      <header className="p-4 border-b border-victory-border">
        <div className="flex items-center gap-4 mb-3">
          {currentQuestion > 0 && (
            <button
              onClick={handleBack}
              className="w-10 h-10 rounded-full bg-victory-card border border-victory-border flex items-center justify-center text-victory-text touch-target"
              data-testid="back-btn"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div className="flex-1">
            <Progress value={progress} className="h-2" />
          </div>
          <span className="text-victory-muted text-sm font-mono">
            {currentQuestion + 1}/{QUIZ_QUESTIONS.length}
          </span>
        </div>
      </header>

      {/* Question */}
      <main className="flex-1 p-6 flex flex-col">
        <div className="mb-8 animate-fade-in">
          <h1 className="text-2xl font-heading font-extrabold text-victory-text mb-2">
            {question.question}
          </h1>
          {question.subtitle && (
            <p className="text-victory-muted">{question.subtitle}</p>
          )}
        </div>

        {/* Options */}
        <div className="space-y-3 flex-1">
          {question.options.map((option) => (
            <button
              key={option.value}
              onClick={() => handleSelect(option.value)}
              className={`w-full p-4 rounded-lg border text-left flex items-center gap-4 touch-target transition-all ${
                isSelected(option.value)
                  ? "bg-victory-lime/10 border-victory-lime text-victory-text"
                  : "bg-victory-card border-victory-border text-victory-text hover:border-victory-muted"
              }`}
              data-testid={`option-${option.value}`}
            >
              <span className="text-2xl">{option.icon}</span>
              <span className="flex-1 font-medium">{option.label}</span>
              {isSelected(option.value) && (
                <Check className="w-5 h-5 text-victory-lime" />
              )}
            </button>
          ))}
        </div>

        {/* Continue Button (for multi-select) */}
        {question.multiSelect && (
          <button
            onClick={handleNext}
            disabled={!canProceed() || loading}
            className="victory-btn-primary mt-6 flex items-center justify-center gap-2"
            data-testid="continue-btn"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-victory-bg border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                Continue
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
        )}
      </main>
    </div>
  );
}

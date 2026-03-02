import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { BottomNav } from "@/components/BottomNav";
import { Pause, Play, SkipForward, Square, RotateCcw, Target } from "lucide-react";

// Bell sound URL (free royalty-free boxing bell)
const BELL_SOUND_URL = "https://www.soundjay.com/sports/boxing-bell-1.mp3";

export default function TimerPage() {
  const navigate = useNavigate();
  const [isConfiguring, setIsConfiguring] = useState(true);
  const [roundDuration, setRoundDuration] = useState(180); // 3 minutes in seconds
  const [restDuration, setRestDuration] = useState(60); // 1 minute in seconds
  const [totalRounds, setTotalRounds] = useState(3);

  const [currentRound, setCurrentRound] = useState(1);
  const [timeLeft, setTimeLeft] = useState(180);
  const [isResting, setIsResting] = useState(false);
  const [isPaused, setIsPaused] = useState(true);
  const [isComplete, setIsComplete] = useState(false);
  const [flashClass, setFlashClass] = useState("");

  const audioRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    // Preload audio
    audioRef.current = new Audio(BELL_SOUND_URL);
    audioRef.current.load();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const playBell = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        // Ignore autoplay errors
      });
    }
  }, []);

  const flashScreen = useCallback((type) => {
    setFlashClass(type === "round" ? "flash-lime" : "flash-teal");
    setTimeout(() => setFlashClass(""), 300);
  }, []);

  useEffect(() => {
    if (isPaused || isComplete || isConfiguring) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Time's up
          playBell();

          if (isResting) {
            // End of rest, start next round
            if (currentRound < totalRounds) {
              flashScreen("round");
              setCurrentRound((r) => r + 1);
              setIsResting(false);
              return roundDuration;
            } else {
              // All rounds complete
              setIsComplete(true);
              return 0;
            }
          } else {
            // End of round
            flashScreen("rest");
            if (currentRound < totalRounds) {
              setIsResting(true);
              return restDuration;
            } else {
              // Last round complete
              setIsComplete(true);
              return 0;
            }
          }
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [
    isPaused,
    isComplete,
    isConfiguring,
    isResting,
    currentRound,
    totalRounds,
    roundDuration,
    restDuration,
    playBell,
    flashScreen,
  ]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getTotalWorkoutTime = () => {
    const total = totalRounds * roundDuration + (totalRounds - 1) * restDuration;
    const mins = Math.floor(total / 60);
    return `${mins} min`;
  };

  const startTimer = () => {
    setIsConfiguring(false);
    setTimeLeft(roundDuration);
    setCurrentRound(1);
    setIsResting(false);
    setIsPaused(false);
    setIsComplete(false);
    playBell();
    flashScreen("round");
  };

  const togglePause = () => {
    setIsPaused((prev) => !prev);
  };

  const skipToNext = () => {
    playBell();
    if (isResting) {
      if (currentRound < totalRounds) {
        flashScreen("round");
        setCurrentRound((r) => r + 1);
        setIsResting(false);
        setTimeLeft(roundDuration);
      } else {
        setIsComplete(true);
      }
    } else {
      flashScreen("rest");
      if (currentRound < totalRounds) {
        setIsResting(true);
        setTimeLeft(restDuration);
      } else {
        setIsComplete(true);
      }
    }
  };

  const endTimer = () => {
    setIsPaused(true);
    setIsComplete(true);
  };

  const resetTimer = () => {
    setIsConfiguring(true);
    setIsPaused(true);
    setIsComplete(false);
    setCurrentRound(1);
    setIsResting(false);
    setTimeLeft(roundDuration);
  };

  return (
    <div
      className={`min-h-screen bg-victory-bg pb-nav flex flex-col ${flashClass}`}
      data-testid="timer-page"
    >
      {isConfiguring ? (
        // Configuration View
        <div className="flex-1 flex flex-col justify-center p-6">
          <h1 className="text-2xl font-heading font-extrabold text-victory-text text-center mb-8">
            Set Your Rounds
          </h1>

          <div className="space-y-8 max-w-md mx-auto w-full">
            {/* Round Duration */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="text-victory-muted">Round Duration</label>
                <span className="font-mono text-xl font-semibold text-victory-lime">
                  {formatTime(roundDuration)}
                </span>
              </div>
              <input
                type="range"
                min={60}
                max={300}
                step={30}
                value={roundDuration}
                onChange={(e) => setRoundDuration(Number(e.target.value))}
                className="w-full h-3"
                data-testid="round-duration-slider"
              />
            </div>

            {/* Rest Duration */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="text-victory-muted">Rest Duration</label>
                <span className="font-mono text-xl font-semibold text-victory-teal">
                  {formatTime(restDuration)}
                </span>
              </div>
              <input
                type="range"
                min={30}
                max={180}
                step={15}
                value={restDuration}
                onChange={(e) => setRestDuration(Number(e.target.value))}
                className="w-full h-3"
                data-testid="rest-duration-slider"
              />
            </div>

            {/* Number of Rounds */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="text-victory-muted">Number of Rounds</label>
                <span className="font-mono text-xl font-semibold text-victory-text">
                  {totalRounds}
                </span>
              </div>
              <div className="flex items-center justify-center gap-6">
                <button
                  onClick={() => setTotalRounds((r) => Math.max(1, r - 1))}
                  className="w-12 h-12 rounded-full bg-victory-card border border-victory-border flex items-center justify-center text-2xl text-victory-text touch-target"
                  data-testid="rounds-decrease"
                >
                  −
                </button>
                <span className="font-mono text-4xl font-semibold text-victory-text w-16 text-center">
                  {totalRounds}
                </span>
                <button
                  onClick={() => setTotalRounds((r) => Math.min(12, r + 1))}
                  className="w-12 h-12 rounded-full bg-victory-card border border-victory-border flex items-center justify-center text-2xl text-victory-text touch-target"
                  data-testid="rounds-increase"
                >
                  +
                </button>
              </div>
            </div>

            {/* Total Time */}
            <p className="text-center text-victory-muted">
              Total: <span className="text-victory-text">{getTotalWorkoutTime()}</span>
            </p>

            {/* Start Button */}
            <button
              onClick={startTimer}
              className="victory-btn-primary"
              data-testid="start-timer-btn"
            >
              Begin Round 1
            </button>
          </div>
        </div>
      ) : isComplete ? (
        // Complete View
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <h1 className="text-3xl font-heading font-extrabold text-victory-lime mb-4 text-center">
            Round {currentRound} Complete!
          </h1>
          <p className="text-victory-muted text-lg mb-8">Great work, champ!</p>

          <div className="space-y-4 w-full max-w-xs">
            <button
              onClick={() => navigate("/score")}
              className="victory-btn-primary flex items-center justify-center gap-2"
              data-testid="score-session-btn"
            >
              <Target className="w-5 h-5" />
              Score This Session
            </button>
            <button
              onClick={resetTimer}
              className="victory-btn-ghost flex items-center justify-center gap-2"
              data-testid="reset-timer-btn"
            >
              <RotateCcw className="w-5 h-5" />
              Reset Timer
            </button>
          </div>
        </div>
      ) : (
        // Active Timer View
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          {/* Status */}
          <p
            className={`text-lg uppercase tracking-widest mb-4 ${
              isResting ? "text-victory-teal" : "text-victory-lime"
            }`}
          >
            {isResting ? "REST" : "ROUND"}
          </p>

          {/* Large Timer Display */}
          <div
            className="timer-display text-victory-text mb-4"
            data-testid="timer-display"
          >
            {formatTime(timeLeft)}
          </div>

          {/* Round Info */}
          <p className="text-victory-muted text-lg mb-12">
            Round {currentRound} of {totalRounds}
          </p>

          {/* Controls */}
          <div className="flex items-center gap-4">
            <button
              onClick={togglePause}
              className="w-16 h-16 rounded-full bg-victory-card border border-victory-border flex items-center justify-center text-victory-text touch-target transition-transform active:scale-95"
              data-testid="pause-btn"
            >
              {isPaused ? (
                <Play className="w-8 h-8" />
              ) : (
                <Pause className="w-8 h-8" />
              )}
            </button>
            <button
              onClick={skipToNext}
              className="w-16 h-16 rounded-full bg-victory-card border border-victory-border flex items-center justify-center text-victory-text touch-target transition-transform active:scale-95"
              data-testid="skip-btn"
            >
              <SkipForward className="w-8 h-8" />
            </button>
            <button
              onClick={endTimer}
              className="w-16 h-16 rounded-full bg-victory-card border border-victory-danger flex items-center justify-center text-victory-danger touch-target transition-transform active:scale-95"
              data-testid="end-btn"
            >
              <Square className="w-8 h-8" />
            </button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

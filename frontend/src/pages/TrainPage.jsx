import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import {
  Pause, Play, SkipForward, Square, RotateCcw,
  Video, VideoOff, Camera, SwitchCamera
} from "lucide-react";

const BELL_SOUND_URL = "https://www.soundjay.com/sports/boxing-bell-1.mp3";

export default function TrainPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // Configuration state
  const [isConfiguring, setIsConfiguring] = useState(true);
  const [roundDuration, setRoundDuration] = useState(180);
  const [restDuration, setRestDuration] = useState(60);
  const [totalRounds, setTotalRounds] = useState(3);
  const [recordVideo, setRecordVideo] = useState(true);
  const [facingMode, setFacingMode] = useState("environment");

  // Training state
  const [sessionId, setSessionId] = useState(null);
  const [currentRound, setCurrentRound] = useState(1);
  const [timeLeft, setTimeLeft] = useState(180);
  const [isResting, setIsResting] = useState(false);
  const [isPaused, setIsPaused] = useState(true);
  const [isComplete, setIsComplete] = useState(false);
  const [flashClass, setFlashClass] = useState("");
  const [showTenSecWarning, setShowTenSecWarning] = useState(false);

  // AI Feedback state
  const [feedback, setFeedback] = useState(null);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [allRoundScores, setAllRoundScores] = useState([]);

  // Camera/Recording state
  const [stream, setStream] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioRef = useRef(null);
  const intervalRef = useRef(null);

  // Load saved preferences
  useEffect(() => {
    const saved = localStorage.getItem("victory_train_config");
    if (saved) {
      const config = JSON.parse(saved);
      setRoundDuration(config.roundDuration || 180);
      setRestDuration(config.restDuration || 60);
      setTotalRounds(config.totalRounds || 3);
      setRecordVideo(config.recordVideo !== false);
    }
    
    audioRef.current = new Audio(BELL_SOUND_URL);
    audioRef.current.load();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      stopCamera();
    };
  }, []);

  // Save preferences
  const saveConfig = useCallback(() => {
    localStorage.setItem("victory_train_config", JSON.stringify({
      roundDuration, restDuration, totalRounds, recordVideo
    }));
  }, [roundDuration, restDuration, totalRounds, recordVideo]);

  const playBell = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }, []);

  const flashScreen = useCallback((type) => {
    setFlashClass(type === "round" ? "flash-lime" : "flash-teal");
    setTimeout(() => setFlashClass(""), 300);
  }, []);

  // Camera functions
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error("Camera error:", error);
      toast.error("Could not access camera");
      setRecordVideo(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const switchCamera = async () => {
    stopCamera();
    setFacingMode(prev => prev === "environment" ? "user" : "environment");
    setTimeout(startCamera, 100);
  };

  const startRecording = () => {
    if (!stream) return;
    
    chunksRef.current = [];
    const options = { mimeType: 'video/webm;codecs=vp9' };
    
    try {
      mediaRecorderRef.current = new MediaRecorder(stream, options);
    } catch (e) {
      mediaRecorderRef.current = new MediaRecorder(stream);
    }
    
    mediaRecorderRef.current.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    
    mediaRecorderRef.current.start(1000);
    setIsRecording(true);
  };

  const stopRecording = async () => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
        resolve(null);
        return;
      }
      
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        setIsRecording(false);
        resolve(blob);
      };
      
      mediaRecorderRef.current.stop();
    });
  };

  // Training functions
  const startTraining = async () => {
    saveConfig();
    
    // Create training session on backend
    try {
      const response = await axios.post(`${API}/training/start`, {
        round_duration: roundDuration,
        rest_duration: restDuration,
        total_rounds: totalRounds,
        record_video: recordVideo
      }, { withCredentials: true });
      
      setSessionId(response.data.session_id);
    } catch (error) {
      console.error("Failed to start session:", error);
    }

    setIsConfiguring(false);
    setTimeLeft(roundDuration);
    setCurrentRound(1);
    setIsResting(false);
    setIsPaused(false);
    setIsComplete(false);
    setFeedback(null);
    setAllRoundScores([]);
    
    if (recordVideo) {
      await startCamera();
      setTimeout(startRecording, 500);
    }
    
    playBell();
    flashScreen("round");
  };

  const generateFeedback = async (roundNum) => {
    setLoadingFeedback(true);
    try {
      const response = await axios.post(`${API}/ai/generate-feedback`, {
        round_number: roundNum,
        total_rounds: totalRounds
      }, { withCredentials: true });
      
      setFeedback(response.data);
      
      // Save round scores
      if (response.data.dimension_scores) {
        setAllRoundScores(prev => [...prev, {
          round: roundNum,
          scores: response.data.dimension_scores
        }]);
      }
    } catch (error) {
      console.error("Feedback error:", error);
    } finally {
      setLoadingFeedback(false);
    }
  };

  // Timer effect
  useEffect(() => {
    if (isPaused || isComplete || isConfiguring) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        // Show 10 second warning during rounds
        if (!isResting && prev === 11) {
          setShowTenSecWarning(true);
          setTimeout(() => setShowTenSecWarning(false), 3000);
        }
        
        if (prev <= 1) {
          playBell();

          if (isResting) {
            // End of rest, start next round
            if (currentRound < totalRounds) {
              flashScreen("round");
              setCurrentRound((r) => r + 1);
              setIsResting(false);
              setFeedback(null);
              if (recordVideo) startRecording();
              return roundDuration;
            } else {
              handleComplete();
              return 0;
            }
          } else {
            // End of round
            flashScreen("rest");
            handleRoundEnd();
            
            if (currentRound < totalRounds) {
              setIsResting(true);
              return restDuration;
            } else {
              handleComplete();
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
  }, [isPaused, isComplete, isConfiguring, isResting, currentRound, totalRounds, roundDuration, restDuration]);

  const handleRoundEnd = async () => {
    // Stop recording
    if (recordVideo && isRecording) {
      const videoBlob = await stopRecording();
      // In production, upload video blob to storage
      console.log("Round video recorded:", videoBlob?.size || 0, "bytes");
    }
    
    // Generate AI feedback
    generateFeedback(currentRound);
  };

  const handleComplete = async () => {
    setIsComplete(true);
    stopCamera();
    
    // Complete session on backend
    if (sessionId) {
      try {
        const response = await axios.post(
          `${API}/training/${sessionId}/complete`,
          {},
          { withCredentials: true }
        );
        
        // Navigate to results
        navigate("/score/results", {
          state: { session: response.data, fromTraining: true }
        });
      } catch (error) {
        console.error("Failed to complete session:", error);
        toast.error("Failed to save session");
      }
    }
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
        setFeedback(null);
        setTimeLeft(roundDuration);
        if (recordVideo) startRecording();
      } else {
        handleComplete();
      }
    } else {
      flashScreen("rest");
      handleRoundEnd();
      if (currentRound < totalRounds) {
        setIsResting(true);
        setTimeLeft(restDuration);
      } else {
        handleComplete();
      }
    }
  };

  const endTimer = () => {
    setIsPaused(true);
    handleComplete();
  };

  const resetTimer = () => {
    stopCamera();
    setIsConfiguring(true);
    setIsPaused(true);
    setIsComplete(false);
    setCurrentRound(1);
    setIsResting(false);
    setTimeLeft(roundDuration);
    setFeedback(null);
    setSessionId(null);
  };

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

  const fighterBuddy = user?.fighter_buddy;

  return (
    <div
      className={`min-h-screen bg-victory-bg pb-nav flex flex-col ${flashClass}`}
      data-testid="train-page"
    >
      {isConfiguring ? (
        // Setup Screen
        <div className="flex-1 flex flex-col justify-center p-6">
          <h1 className="text-2xl font-heading font-extrabold text-victory-text text-center mb-8">
            Set Your Training
          </h1>

          <div className="space-y-6 max-w-md mx-auto w-full">
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
                min={60} max={300} step={30}
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
                min={30} max={180} step={15}
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
                >
                  −
                </button>
                <span className="font-mono text-4xl font-semibold text-victory-text w-16 text-center">
                  {totalRounds}
                </span>
                <button
                  onClick={() => setTotalRounds((r) => Math.min(12, r + 1))}
                  className="w-12 h-12 rounded-full bg-victory-card border border-victory-border flex items-center justify-center text-2xl text-victory-text touch-target"
                >
                  +
                </button>
              </div>
            </div>

            {/* Record Video Toggle */}
            <div className="victory-card p-4">
              <button
                onClick={() => setRecordVideo(!recordVideo)}
                className="w-full flex items-center justify-between touch-target"
                data-testid="record-video-toggle"
              >
                <div className="flex items-center gap-3">
                  {recordVideo ? (
                    <Video className="w-6 h-6 text-victory-lime" />
                  ) : (
                    <VideoOff className="w-6 h-6 text-victory-muted" />
                  )}
                  <div className="text-left">
                    <p className="text-victory-text font-medium">Record video each round</p>
                    <p className="text-victory-muted text-sm">
                      Victory AI will auto-record and analyse your technique
                    </p>
                  </div>
                </div>
                <div className={`w-12 h-6 rounded-full transition-colors ${
                  recordVideo ? "bg-victory-lime" : "bg-victory-border"
                }`}>
                  <div className={`w-5 h-5 rounded-full bg-white mt-0.5 transition-transform ${
                    recordVideo ? "translate-x-6" : "translate-x-0.5"
                  }`} />
                </div>
              </button>
            </div>

            {/* Total Time */}
            <p className="text-center text-victory-muted">
              Total: <span className="text-victory-text">{getTotalWorkoutTime()}</span>
            </p>

            {/* Start Button */}
            <button
              onClick={startTraining}
              className="victory-btn-primary"
              data-testid="start-training-btn"
            >
              Start Training
            </button>
          </div>
        </div>
      ) : (
        // Active Training View
        <div className="flex-1 flex flex-col">
          {/* Camera Preview (small in corner during rounds) */}
          {recordVideo && stream && !isResting && (
            <div className="absolute top-4 right-4 z-10">
              <div className="relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-24 h-32 rounded-lg object-cover border-2 border-victory-lime"
                />
                {isRecording && (
                  <div className="absolute top-1 left-1 w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                )}
                <button
                  onClick={switchCamera}
                  className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-victory-bg/80 flex items-center justify-center"
                >
                  <SwitchCamera className="w-4 h-4 text-victory-text" />
                </button>
              </div>
            </div>
          )}

          {/* Main Timer Area */}
          <div className="flex-1 flex flex-col items-center justify-center p-6">
            {/* Status */}
            <p className={`text-lg uppercase tracking-widest mb-4 ${
              isResting ? "text-victory-teal" : "text-victory-lime"
            }`}>
              {isResting ? "REST" : "ROUND"}
            </p>

            {/* Large Timer Display */}
            <div className="timer-display text-victory-text mb-4" data-testid="timer-display">
              {formatTime(timeLeft)}
            </div>

            {/* Round Info */}
            <p className="text-victory-muted text-lg mb-4">
              Round {currentRound} of {totalRounds}
            </p>

            {/* 10 Second Warning */}
            {showTenSecWarning && (
              <div className="victory-card px-4 py-2 mb-4 animate-pulse">
                <p className="text-victory-lime text-sm">
                  {fighterBuddy?.name || "Your fighter"} is watching — finish strong!
                </p>
              </div>
            )}

            {/* AI Feedback Card (during rest) */}
            {isResting && (
              <div className="w-full max-w-md mt-4">
                <div className="victory-card p-4">
                  <div className="flex items-center gap-3 mb-4">
                    {fighterBuddy?.avatar_url ? (
                      <img
                        src={fighterBuddy.avatar_url}
                        alt={fighterBuddy.name}
                        className="w-10 h-10 rounded-full object-cover border border-victory-lime"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-victory-lime flex items-center justify-center text-victory-bg font-bold">
                        {fighterBuddy?.name?.[0] || "F"}
                      </div>
                    )}
                    <div>
                      <p className="text-victory-lime font-semibold">
                        {fighterBuddy?.name || "Your Coach"} says...
                      </p>
                    </div>
                  </div>

                  {loadingFeedback ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="w-6 h-6 border-2 border-victory-lime border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : feedback ? (
                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <span className="text-victory-lime">✓</span>
                        <p className="text-victory-text text-sm">{feedback.what_you_did_well}</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-victory-orange">→</span>
                        <p className="text-victory-text text-sm">{feedback.what_to_tighten}</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-victory-teal">📋</span>
                        <p className="text-victory-text text-sm">{feedback.drill_focus}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-victory-muted text-sm text-center">
                      Analyzing your round...
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center gap-4 mt-8">
              <button
                onClick={togglePause}
                className="w-16 h-16 rounded-full bg-victory-card border border-victory-border flex items-center justify-center text-victory-text touch-target transition-transform active:scale-95"
                data-testid="pause-btn"
              >
                {isPaused ? <Play className="w-8 h-8" /> : <Pause className="w-8 h-8" />}
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
        </div>
      )}

      <BottomNav />
    </div>
  );
}

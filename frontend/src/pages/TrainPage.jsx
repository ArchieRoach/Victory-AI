import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import {
  Pause, Play, SkipForward, Square, RotateCcw,
  Video, VideoOff, SwitchCamera, Upload, CheckCircle
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
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [analyzingVideo, setAnalyzingVideo] = useState(false);

  // Camera/Recording state
  const [stream, setStream] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioRef = useRef(null);
  const intervalRef = useRef(null);

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

  const saveConfig = useCallback(() => {
    localStorage.setItem("victory_train_config", JSON.stringify({ roundDuration, restDuration, totalRounds, recordVideo }));
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
      if (videoRef.current) videoRef.current.srcObject = mediaStream;
    } catch (error) {
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
    try {
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
    } catch {
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

  // Upload video to Cloudinary
  const uploadVideoToCloudinary = async (videoBlob, roundNum) => {
    try {
      setUploadingVideo(true);
      
      // Get signature from backend
      const sigRes = await axios.get(`${API}/cloudinary/signature?resource_type=video`, { withCredentials: true });
      const { signature, timestamp, cloud_name, api_key, folder } = sigRes.data;

      if (!cloud_name || !api_key) {
        console.log("Cloudinary not configured, skipping upload");
        return null;
      }

      // Upload to Cloudinary
      const formData = new FormData();
      formData.append("file", videoBlob);
      formData.append("api_key", api_key);
      formData.append("timestamp", timestamp);
      formData.append("signature", signature);
      formData.append("folder", folder);
      formData.append("resource_type", "video");

      const uploadRes = await axios.post(
        `https://api.cloudinary.com/v1_1/${cloud_name}/video/upload`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );

      const videoUrl = uploadRes.data.secure_url;
      const publicId = uploadRes.data.public_id;

      // Register video in backend
      await axios.post(`${API}/videos/register`, {
        session_id: sessionId,
        round_number: roundNum,
        video_url: videoUrl,
        public_id: publicId
      }, { withCredentials: true });

      return videoUrl;
    } catch (error) {
      console.error("Video upload error:", error);
      return null;
    } finally {
      setUploadingVideo(false);
    }
  };

  // Analyze video with GPT-4 Vision
  const analyzeVideoWithAI = async (videoUrl, roundNum) => {
    try {
      setAnalyzingVideo(true);
      const res = await axios.post(`${API}/ai/analyze-video`, {
        video_url: videoUrl,
        round_number: roundNum
      }, { withCredentials: true });
      return res.data.analysis;
    } catch (error) {
      console.error("Video analysis error:", error);
      return null;
    } finally {
      setAnalyzingVideo(false);
    }
  };

  // Generate feedback
  const generateFeedback = async (roundNum, videoAnalysis = null) => {
    setLoadingFeedback(true);
    try {
      const res = await axios.post(`${API}/ai/generate-feedback`, {
        round_number: roundNum,
        total_rounds: totalRounds,
        video_analysis: videoAnalysis
      }, { withCredentials: true });
      setFeedback(res.data);
    } catch (error) {
      console.error("Feedback error:", error);
    } finally {
      setLoadingFeedback(false);
    }
  };

  // Training functions
  const startTraining = async () => {
    saveConfig();
    
    try {
      const res = await axios.post(`${API}/training/start`, {
        round_duration: roundDuration,
        rest_duration: restDuration,
        total_rounds: totalRounds,
        record_video: recordVideo
      }, { withCredentials: true });
      setSessionId(res.data.session_id);
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
    
    if (recordVideo) {
      await startCamera();
      setTimeout(startRecording, 500);
    }
    
    playBell();
    flashScreen("round");
  };

  // Timer effect
  useEffect(() => {
    if (isPaused || isComplete || isConfiguring) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (!isResting && prev === 11) {
          setShowTenSecWarning(true);
          setTimeout(() => setShowTenSecWarning(false), 3000);
        }
        
        if (prev <= 1) {
          playBell();

          if (isResting) {
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

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPaused, isComplete, isConfiguring, isResting, currentRound, totalRounds, roundDuration, restDuration]);

  const handleRoundEnd = async () => {
    let videoAnalysis = null;
    
    if (recordVideo && isRecording) {
      const videoBlob = await stopRecording();
      
      if (videoBlob && videoBlob.size > 0) {
        // Upload to Cloudinary
        const videoUrl = await uploadVideoToCloudinary(videoBlob, currentRound);
        
        // Analyze with GPT-4 Vision
        if (videoUrl) {
          videoAnalysis = await analyzeVideoWithAI(videoUrl, currentRound);
        }
      }
    }
    
    // Generate feedback (with or without video analysis)
    generateFeedback(currentRound, videoAnalysis);
  };

  const handleComplete = async () => {
    setIsComplete(true);
    stopCamera();
    
    if (sessionId) {
      try {
        const res = await axios.post(`${API}/training/${sessionId}/complete`, {}, { withCredentials: true });
        navigate("/score/results", { state: { session: res.data, fromTraining: true } });
      } catch (error) {
        toast.error("Failed to save session");
      }
    }
  };

  const togglePause = () => setIsPaused((prev) => !prev);

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
    return `${Math.floor(total / 60)} min`;
  };

  const trainingPartner = user?.training_partner;

  return (
    <div className={`min-h-screen bg-victory-bg pb-nav flex flex-col ${flashClass}`} data-testid="train-page">
      {isConfiguring ? (
        <div className="flex-1 flex flex-col justify-center p-6">
          <h1 className="text-2xl font-heading font-extrabold text-victory-text text-center mb-8">
            Set Your Training
          </h1>

          <div className="space-y-6 max-w-md mx-auto w-full">
            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="text-victory-muted">Round Duration</label>
                <span className="font-mono text-xl font-semibold text-victory-lime">{formatTime(roundDuration)}</span>
              </div>
              <input type="range" min={60} max={300} step={30} value={roundDuration} onChange={(e) => setRoundDuration(Number(e.target.value))} className="w-full h-3" />
            </div>

            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="text-victory-muted">Rest Duration</label>
                <span className="font-mono text-xl font-semibold text-victory-teal">{formatTime(restDuration)}</span>
              </div>
              <input type="range" min={30} max={180} step={15} value={restDuration} onChange={(e) => setRestDuration(Number(e.target.value))} className="w-full h-3" />
            </div>

            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="text-victory-muted">Number of Rounds</label>
                <span className="font-mono text-xl font-semibold text-victory-text">{totalRounds}</span>
              </div>
              <div className="flex items-center justify-center gap-6">
                <button onClick={() => setTotalRounds((r) => Math.max(1, r - 1))} className="w-12 h-12 rounded-full bg-victory-card border border-victory-border flex items-center justify-center text-2xl text-victory-text touch-target">−</button>
                <span className="font-mono text-4xl font-semibold text-victory-text w-16 text-center">{totalRounds}</span>
                <button onClick={() => setTotalRounds((r) => Math.min(12, r + 1))} className="w-12 h-12 rounded-full bg-victory-card border border-victory-border flex items-center justify-center text-2xl text-victory-text touch-target">+</button>
              </div>
            </div>

            <div className="victory-card p-4">
              <button onClick={() => setRecordVideo(!recordVideo)} className="w-full flex items-center justify-between touch-target">
                <div className="flex items-center gap-3">
                  {recordVideo ? <Video className="w-6 h-6 text-victory-lime" /> : <VideoOff className="w-6 h-6 text-victory-muted" />}
                  <div className="text-left">
                    <p className="text-victory-text font-medium">Record & Analyze</p>
                    <p className="text-victory-muted text-sm">AI will analyze your technique with GPT-4 Vision</p>
                  </div>
                </div>
                <div className={`w-12 h-6 rounded-full transition-colors ${recordVideo ? "bg-victory-lime" : "bg-victory-border"}`}>
                  <div className={`w-5 h-5 rounded-full bg-white mt-0.5 transition-transform ${recordVideo ? "translate-x-6" : "translate-x-0.5"}`} />
                </div>
              </button>
            </div>

            <p className="text-center text-victory-muted">Total: <span className="text-victory-text">{getTotalWorkoutTime()}</span></p>

            <button onClick={startTraining} className="victory-btn-primary" data-testid="start-training-btn">Start Training</button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          {/* Camera Preview */}
          {recordVideo && stream && !isResting && (
            <div className="absolute top-4 right-4 z-10">
              <div className="relative">
                <video ref={videoRef} autoPlay playsInline muted className="w-24 h-32 rounded-lg object-cover border-2 border-victory-lime" />
                {isRecording && <div className="absolute top-1 left-1 w-3 h-3 rounded-full bg-red-500 animate-pulse" />}
                <button onClick={switchCamera} className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-victory-bg/80 flex items-center justify-center">
                  <SwitchCamera className="w-4 h-4 text-victory-text" />
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 flex flex-col items-center justify-center p-6">
            <p className={`text-lg uppercase tracking-widest mb-4 ${isResting ? "text-victory-teal" : "text-victory-lime"}`}>
              {isResting ? "REST" : "ROUND"}
            </p>

            <div className="timer-display text-victory-text mb-4" data-testid="timer-display">{formatTime(timeLeft)}</div>

            <p className="text-victory-muted text-lg mb-4">Round {currentRound} of {totalRounds}</p>

            {showTenSecWarning && (
              <div className="victory-card px-4 py-2 mb-4 animate-pulse">
                <p className="text-victory-lime text-sm">{trainingPartner?.name || "Your partner"} is watching — finish strong!</p>
              </div>
            )}

            {/* Upload/Analysis Status */}
            {(uploadingVideo || analyzingVideo) && (
              <div className="victory-card px-4 py-2 mb-4 flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-victory-lime border-t-transparent rounded-full animate-spin" />
                <p className="text-victory-muted text-sm">
                  {uploadingVideo ? "Uploading video..." : "Analyzing technique with AI..."}
                </p>
              </div>
            )}

            {/* AI Feedback Card */}
            {isResting && (
              <div className="w-full max-w-md mt-4">
                <div className="victory-card p-4">
                  <div className="flex items-center gap-3 mb-4">
                    {trainingPartner?.avatar_url ? (
                      <img src={trainingPartner.avatar_url} alt={trainingPartner.name} className="w-10 h-10 rounded-full object-cover border border-victory-lime" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-victory-lime flex items-center justify-center text-victory-bg font-bold">
                        {trainingPartner?.name?.[0] || "C"}
                      </div>
                    )}
                    <div>
                      <p className="text-victory-lime font-semibold">{trainingPartner?.name || "Your Coach"} says...</p>
                    </div>
                  </div>

                  {loadingFeedback || uploadingVideo || analyzingVideo ? (
                    <div className="flex items-center justify-center py-4 gap-2">
                      <div className="w-6 h-6 border-2 border-victory-lime border-t-transparent rounded-full animate-spin" />
                      <span className="text-victory-muted text-sm">
                        {analyzingVideo ? "Analyzing your form..." : "Generating feedback..."}
                      </span>
                    </div>
                  ) : feedback ? (
                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-victory-lime mt-0.5" />
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
                      {feedback.accountability_check && (
                        <div className="mt-3 pt-3 border-t border-victory-border">
                          <p className="text-victory-muted text-xs">{feedback.accountability_check}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-victory-muted text-sm text-center">Preparing feedback...</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-4 mt-8">
              <button onClick={togglePause} className="w-16 h-16 rounded-full bg-victory-card border border-victory-border flex items-center justify-center text-victory-text touch-target transition-transform active:scale-95">
                {isPaused ? <Play className="w-8 h-8" /> : <Pause className="w-8 h-8" />}
              </button>
              <button onClick={skipToNext} className="w-16 h-16 rounded-full bg-victory-card border border-victory-border flex items-center justify-center text-victory-text touch-target transition-transform active:scale-95">
                <SkipForward className="w-8 h-8" />
              </button>
              <button onClick={endTimer} className="w-16 h-16 rounded-full bg-victory-card border border-victory-danger flex items-center justify-center text-victory-danger touch-target transition-transform active:scale-95">
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

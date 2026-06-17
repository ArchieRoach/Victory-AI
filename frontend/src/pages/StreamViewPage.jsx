import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { toast } from "sonner";
import { ArrowLeft, Radio, Users, Scissors } from "lucide-react";
import LivePlayer from "@/components/LivePlayer";
import LiveChat from "@/components/LiveChat";

const TYPE_COLORS = {
  training: "bg-blue-500/20 text-blue-400",
  sparring: "bg-yellow-500/20 text-yellow-400",
  smoker: "bg-orange-500/20 text-orange-400",
  bout: "bg-red-500/20 text-red-400",
};

export default function StreamViewPage() {
  const { streamId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stream, setStream] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clipping, setClipping] = useState(false);
  const streamStartRef = useRef(Date.now());

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await axios.get(`${API}/streams/${streamId}`);
        setStream(res.data);
        streamStartRef.current = Date.now();
      } catch (err) {
        if (err?.response?.status === 404) {
          toast.error("Stream not found.");
          navigate("/live");
        }
      } finally {
        setLoading(false);
      }
    };
    fetch();
    // Poll viewer count every 30s
    const poll = setInterval(async () => {
      try {
        const res = await axios.get(`${API}/streams/${streamId}`);
        setStream((prev) => prev ? { ...prev, viewer_count: res.data.viewer_count, status: res.data.status } : prev);
      } catch {}
    }, 30000);
    return () => clearInterval(poll);
  }, [streamId, navigate]);

  const handleClip = async () => {
    if (!stream?.playback_id) return;
    setClipping(true);
    const end = Date.now();
    const start = end - 30000;
    try {
      await axios.post(`${API}/streams/${streamId}/clip`, null, {
        params: { start_time: start, end_time: end },
      });
      toast.success("Clip saved!");
    } catch {
      toast.error("Clip failed — try again.");
    } finally {
      setClipping(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-victory-lime border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!stream) return null;

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-black/80">
        <button onClick={() => navigate("/live")} className="text-victory-muted hover:text-victory-text">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {stream.status === "live" && (
              <span className="flex items-center gap-1 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded">
                <Radio className="w-3 h-3" /> LIVE
              </span>
            )}
            <span className={`text-xs font-medium px-2 py-0.5 rounded capitalize ${TYPE_COLORS[stream.type] || "bg-victory-border text-victory-muted"}`}>
              {stream.type}
            </span>
          </div>
          <h1 className="text-victory-text font-semibold text-sm truncate mt-0.5">{stream.title}</h1>
        </div>
        <div className="flex items-center gap-1 text-victory-muted text-xs flex-shrink-0">
          <Users className="w-3.5 h-3.5" />
          {stream.viewer_count}
        </div>
      </div>

      {/* Video */}
      <LivePlayer playbackId={stream.playback_id} autoPlay />

      {/* Stream info */}
      <div className="bg-victory-bg px-4 py-3 border-b border-victory-border">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {stream.user_avatar ? (
              <img src={stream.user_avatar} alt={stream.user_name} className="w-8 h-8 rounded-full object-cover border border-victory-border flex-shrink-0" onError={(e) => { e.target.style.display = "none"; }} />
            ) : (
              <div className="w-8 h-8 rounded-full bg-victory-lime/20 flex items-center justify-center text-victory-lime text-sm font-bold flex-shrink-0">
                {(stream.user_name || "F")[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-victory-text text-sm font-semibold truncate">{stream.user_name}</p>
              {stream.description && (
                <p className="text-victory-muted text-xs truncate">{stream.description}</p>
              )}
            </div>
          </div>

          {stream.status === "live" && user?.has_subscription && (
            <button
              onClick={handleClip}
              disabled={clipping}
              className="flex items-center gap-1.5 border border-victory-border text-victory-text text-xs rounded-lg px-3 py-1.5 hover:border-victory-lime transition-colors disabled:opacity-50 flex-shrink-0"
            >
              <Scissors className="w-3.5 h-3.5" />
              {clipping ? "Saving..." : "Clip 30s"}
            </button>
          )}
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 bg-victory-bg p-3">
        <LiveChat
          streamId={streamId}
          user={user}
          className="h-full"
        />
      </div>
    </div>
  );
}

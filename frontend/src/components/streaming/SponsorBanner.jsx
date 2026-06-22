import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { X, Clock } from "lucide-react";

function useMidRollSimulator(enabled = false) {
  const [countdown, setCountdown] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    const warmup = setTimeout(() => {
      setCountdown(60);
      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) { clearInterval(timerRef.current); return null; }
          return prev - 1;
        });
      }, 1000);
    }, 90_000);
    return () => { clearTimeout(warmup); clearInterval(timerRef.current); };
  }, [enabled]);

  return countdown;
}

export function SponsorBanner({ className = "", simulateAd = false }) {
  const navigate              = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const [campaign,  setCampaign]  = useState(undefined); // undefined = loading, null = none
  const midRollCountdown = useMidRollSimulator(simulateAd);

  useEffect(() => {
    axios.get(`${API}/ads/active`)
      .then((r) => setCampaign(r.data || null))
      .catch(() => setCampaign(null));
  }, []);

  if (dismissed || campaign === undefined) return null;

  const isLive     = !!campaign;
  const brandName  = campaign?.brand_name  || "Your Brand Here";
  const tagline    = campaign?.tagline     || "Premium boxing gloves for serious fighters";
  const websiteUrl = campaign?.website_url || null;
  const initial    = brandName[0].toUpperCase();

  const handleLearnMore = (e) => {
    e.preventDefault();
    if (isLive && websiteUrl) {
      window.open(websiteUrl, "_blank", "noopener,noreferrer");
    } else {
      navigate("/advertise");
    }
  };

  return (
    <>
      {/* Mid-roll countdown */}
      {midRollCountdown !== null && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-orange-900/95 border border-orange-500/50 text-orange-200 px-5 py-3 rounded-2xl shadow-2xl text-sm font-semibold backdrop-blur-sm">
          <Clock className="w-4 h-4 text-orange-400" />
          <span>Ad break in <strong className="text-orange-300 font-mono">{midRollCountdown}s</strong></span>
        </div>
      )}

      <div className={`relative bg-[#0d0d14] border-y border-victory-border px-4 py-2.5 flex items-center justify-between gap-3 ${className}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-victory-lime/20 border border-victory-lime/30 flex items-center justify-center flex-shrink-0">
            <span className="text-victory-lime text-xs font-extrabold">{initial}</span>
          </div>
          <div className="min-w-0">
            <p className="text-white text-xs font-semibold truncate">
              Sponsored by <span className="text-victory-lime">{brandName}</span>
            </p>
            <p className="text-victory-muted text-[10px] truncate">{tagline}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleLearnMore}
            className="text-[10px] font-semibold text-victory-lime border border-victory-lime/40 rounded-lg px-2.5 py-1 hover:bg-victory-lime/10 transition-colors whitespace-nowrap"
          >
            {isLive ? "Learn More" : "Advertise Here"}
          </button>
          <button onClick={() => setDismissed(true)} className="text-victory-muted hover:text-victory-text">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <span className="absolute top-1 right-8 text-[9px] text-victory-muted/50">AD</span>
      </div>
    </>
  );
}

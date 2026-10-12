import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import QRCode from "qrcode";
import { ArrowLeft, Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/App";

// Goal: more real gym sessions, and gyms that promote the app for us.
// Psychology: a physical object is a prompt right where training happens (Fogg), and effort
//   for your team pulls harder than effort alone (Core Drive 5).
// Design: a printable poster. Fighters scan it at the gym and that day's verified time counts
//   double for the gym's season total. A new poster cancels the old code if one gets shared.
export default function GymPosterPage() {
  const { gymId } = useParams();
  const navigate = useNavigate();
  const [poster, setPoster] = useState(null);
  const [qr, setQr] = useState(null);

  useEffect(() => {
    axios.get(`${API}/gyms/${gymId}/checkin-poster`).then((r) => setPoster(r.data))
      .catch((e) => { toast.error(e?.response?.data?.detail || "Couldn't load the poster"); navigate(`/gyms/${gymId}`); });
  }, [gymId, navigate]);

  useEffect(() => {
    if (!poster) return;
    QRCode.toDataURL(poster.url, { width: 640, margin: 1, errorCorrectionLevel: "M" }).then(setQr).catch(() => setQr(null));
  }, [poster]);

  const fresh = async () => {
    if (!window.confirm("Make a new poster? The old one stops working.")) return;
    try {
      const { data } = await axios.post(`${API}/gyms/${gymId}/checkin-poster/new`);
      setPoster(data);
      toast.success("New poster ready. Print it and swap the old one.");
    } catch {
      toast.error("Couldn't make a new poster");
    }
  };

  return (
    <div className="min-h-screen bg-victory-bg" data-testid="gym-poster-page">
      <header className="p-4 flex items-center gap-3 print:hidden">
        <button onClick={() => navigate(`/gyms/${gymId}`)} aria-label="Go back"
          className="w-11 h-11 rounded-full bg-victory-card border border-victory-border flex items-center justify-center">
          <ArrowLeft className="w-5 h-5 text-victory-text" />
        </button>
        <h1 className="flex-1 text-lg font-heading font-bold text-victory-text">Check-in poster</h1>
      </header>
      <main className="max-w-md mx-auto p-4 space-y-4">
        {!poster ? <div className="skeleton-shimmer h-96 rounded-lg" /> : (
          <>
            <section className="rounded-2xl bg-white text-black p-6 text-center space-y-3 print:shadow-none">
              <p className="text-xs font-bold uppercase tracking-[0.2em]">Victory AI</p>
              <h2 className="text-2xl font-extrabold leading-tight">Training at {poster.gym}?</h2>
              <p className="text-sm">Scan before you train. Your verified time today counts <b>{poster.multiplier}x</b> for the gym.</p>
              {qr ? <img src={qr} alt={`Check-in code for ${poster.gym}`} className="w-64 h-64 mx-auto" /> : <div className="w-64 h-64 mx-auto bg-gray-100" />}
              <p className="text-[11px] text-gray-600">No location tracking. The code only tells us which gym.</p>
            </section>
            <div className="grid grid-cols-2 gap-2 print:hidden">
              <button className="victory-btn-primary flex items-center justify-center gap-2" onClick={() => window.print()}><Printer className="w-4 h-4" /> Print</button>
              <button className="victory-btn-ghost flex items-center justify-center gap-2" onClick={fresh}><RefreshCw className="w-4 h-4" /> New code</button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

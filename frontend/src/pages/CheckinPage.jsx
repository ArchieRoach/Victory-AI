import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { MapPin, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { tx } from "@/i18n/tx";

// Scanned from the QR poster on a gym wall. Only the code is sent: no GPS, no location saved.
export default function CheckinPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [res, setRes] = useState(null);
  const [error, setError] = useState(null);

  const checkIn = useCallback(() => {
    axios.post(`${API}/gyms/checkin`, { code })
      .then((r) => setRes(r.data))
      .catch((e) => setError(e?.response?.data?.detail || "Couldn't check you in. Try scanning again."));
  }, [code]);
  useEffect(() => { checkIn(); }, [checkIn]);

  const join = async () => {
    try {
      await axios.post(`${API}/gyms/${res.gym_id}/join`);
      checkIn();
    } catch (e) {
      toast.error(e?.response?.data?.detail || tx("ui.checkinPage.couldnTJoinThat", "Couldn't join that gym"));
    }
  };

  return (
    <div className="min-h-screen bg-victory-bg pb-nav" data-testid="checkin-page">
      <main className="max-w-md mx-auto p-6 pt-16 space-y-4 text-center">
        {!res && !error && <div className="skeleton-shimmer h-40 rounded-lg" />}
        {error && (
          <div className="victory-card p-6 space-y-3">
            <MapPin className="w-10 h-10 mx-auto text-victory-muted" />
            <p className="text-victory-text font-heading font-bold">{error}</p>
            <button className="victory-btn-secondary" onClick={() => navigate("/home")}>{tx("ui.checkinPage.goHome", "Go home")}</button>
          </div>
        )}
        {res?.checked_in && (
          <div className="victory-card p-6 space-y-3 border-victory-lime/40 bg-victory-lime/5">
            <CheckCircle2 className="w-12 h-12 mx-auto text-victory-lime" />
            <p className="text-victory-text font-heading font-extrabold text-xl">{res.gym}</p>
            <p className="text-victory-text text-sm">{res.line}</p>
            <button className="victory-btn-primary" onClick={() => navigate("/train")}>{tx("ui.checkinPage.startTraining", "Start training")}</button>
          </div>
        )}
        {res && !res.checked_in && (
          <div className="victory-card p-6 space-y-3">
            <p className="text-victory-text font-heading font-bold">{tx("ui.checkinPage.youReAt", "You're at")} {res.gym}</p>
            <p className="text-victory-muted text-sm">{tx("ui.checkinPage.checkInsCountFor", "Check-ins count for members.")} {res.can_join ? tx("ui.checkinPage.joinToFightFor", "Join to fight for this gym.") : tx("ui.checkinPage.askTheGymFor", "Ask the gym for an invite code.")}</p>
            {res.can_join && <button className="victory-btn-primary" onClick={join}>{tx("ui.checkinPage.join", "Join")} {res.gym}</button>}
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}

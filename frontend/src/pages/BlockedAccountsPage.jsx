import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { toast } from "sonner";
import { ArrowLeft, Ban } from "lucide-react";

export default function BlockedAccountsPage() {
  const navigate = useNavigate();
  const [users,      setUsers]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [unblocking, setUnblocking] = useState({});

  useEffect(() => {
    axios.get(`${API}/users/me/blocked`)
      .then((res) => setUsers(res.data))
      .catch(() => toast.error("Couldn't load blocked accounts."))
      .finally(() => setLoading(false));
  }, []);

  const handleUnblock = async (targetId) => {
    setUnblocking((s) => ({ ...s, [targetId]: true }));
    try {
      await axios.delete(`${API}/users/${targetId}/block`);
      setUsers((prev) => prev.filter((u) => u.user_id !== targetId));
      toast.success("Unblocked.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Couldn't unblock.");
      setUnblocking((s) => ({ ...s, [targetId]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-victory-bg">
      <header className="sticky top-0 z-10 bg-victory-bg/95 backdrop-blur-sm border-b border-victory-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Go back" className="w-11 h-11 flex items-center justify-center touch-target text-victory-muted hover:text-victory-text">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-victory-text font-heading font-extrabold text-base">Blocked Accounts</h1>
      </header>

      <div className="px-4 py-4 max-w-lg mx-auto space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="victory-card p-4 flex items-center gap-3 animate-pulse">
              <div className="w-11 h-11 rounded-full bg-victory-border flex-shrink-0" />
              <div className="flex-1 h-3 bg-victory-border rounded w-1/2" />
            </div>
          ))
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Ban className="w-10 h-10 text-victory-muted mb-3" />
            <p className="text-victory-muted text-sm">You haven't blocked anyone.</p>
          </div>
        ) : (
          users.map((u) => (
            <div key={u.user_id} className="victory-card p-4 flex items-center gap-3">
              {u.avatar_url || u.picture ? (
                <img src={u.avatar_url || u.picture} alt={u.display_name}
                  className="w-11 h-11 rounded-full object-cover border border-victory-border flex-shrink-0"
                  onError={(e) => { e.target.style.display = "none"; }} />
              ) : (
                <div className="w-11 h-11 rounded-full bg-victory-lime/10 flex items-center justify-center text-victory-lime font-bold flex-shrink-0">
                  {(u.display_name || u.name || "F")[0].toUpperCase()}
                </div>
              )}
              <p className="text-victory-text font-medium flex-1 truncate">{u.display_name || u.name}</p>
              <button
                onClick={() => handleUnblock(u.user_id)}
                disabled={unblocking[u.user_id]}
                className="touch-target px-3 flex items-center justify-center rounded-xl text-xs font-bold border border-victory-border text-victory-muted hover:border-victory-lime/40 hover:text-victory-text disabled:opacity-50 flex-shrink-0"
              >
                {unblocking[u.user_id] ? "…" : "Unblock"}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

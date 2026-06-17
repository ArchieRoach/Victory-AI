import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { toast } from "sonner";
import { Radio, Copy, Check, Eye, EyeOff, Plus, Trash2, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";

const TYPE_OPTIONS = [
  { value: "training", label: "Training" },
  { value: "sparring", label: "Sparring" },
  { value: "smoker", label: "Smoker" },
  { value: "bout", label: "Bout" },
];

const STATUS_COLORS = {
  live: "bg-red-500 text-white",
  idle: "bg-victory-lime/20 text-victory-lime",
  ended: "bg-victory-border text-victory-muted",
};

const STATUS_LABELS = {
  live: "LIVE",
  idle: "Ready",
  ended: "Ended",
};

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 text-xs text-victory-lime border border-victory-lime/30 rounded px-2 py-1 hover:bg-victory-lime/10 transition-colors"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied!" : label}
    </button>
  );
}

function StreamCard({ stream, onStatusChange, onDelete }) {
  const navigate = useNavigate();
  const [showKey, setShowKey] = useState(false);
  const [showCreds, setShowCreds] = useState(stream.status === "idle");
  const [loading, setLoading] = useState(false);

  const setStatus = async (status) => {
    setLoading(true);
    try {
      await axios.patch(`${API}/streams/${stream.stream_id}`, { status });
      onStatusChange(stream.stream_id, status);
      toast.success(status === "live" ? "You're live!" : "Stream ended.");
    } catch {
      toast.error("Failed to update stream status.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="victory-card p-4 space-y-3">
      {/* Title row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[stream.status] || "bg-victory-border text-victory-muted"}`}>
              {STATUS_LABELS[stream.status] || stream.status}
            </span>
            <span className="text-xs text-victory-muted capitalize">{stream.type}</span>
          </div>
          <h3 className="font-semibold text-victory-text mt-1 truncate">{stream.title}</h3>
          {stream.description && (
            <p className="text-victory-muted text-xs mt-0.5 line-clamp-2">{stream.description}</p>
          )}
        </div>
        <button
          onClick={() => onDelete(stream.stream_id)}
          className="text-victory-muted hover:text-red-400 transition-colors flex-shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* RTMP Credentials toggle */}
      {stream.status !== "ended" && (
        <button
          onClick={() => setShowCreds(!showCreds)}
          className="flex items-center gap-1.5 text-xs text-victory-muted hover:text-victory-text transition-colors"
        >
          {showCreds ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          OBS Credentials
        </button>
      )}

      {showCreds && stream.status !== "ended" && (
        <div className="bg-victory-bg rounded-lg p-3 space-y-2 text-xs">
          <p className="text-victory-muted">Paste into OBS → Settings → Stream → Custom…</p>
          <div className="space-y-2">
            <div>
              <p className="text-victory-muted mb-1">RTMP Server</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-black/30 rounded px-2 py-1 text-victory-text font-mono truncate text-[11px]">
                  {stream.rtmp_url}
                </code>
                <CopyButton text={stream.rtmp_url} label="Copy" />
              </div>
            </div>
            <div>
              <p className="text-victory-muted mb-1">Stream Key</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-black/30 rounded px-2 py-1 text-victory-text font-mono truncate text-[11px]">
                  {showKey ? stream.stream_key : "•".repeat(Math.min(stream.stream_key?.length || 20, 24))}
                </code>
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="text-victory-muted hover:text-victory-text transition-colors"
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <CopyButton text={stream.stream_key} label="Copy" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        {stream.status === "idle" && (
          <button
            onClick={() => setStatus("live")}
            disabled={loading}
            className="flex items-center gap-1.5 bg-red-500 text-white text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-50 transition-opacity"
          >
            <Radio className="w-4 h-4" />
            I'm Live
          </button>
        )}
        {stream.status === "live" && (
          <>
            <button
              onClick={() => setStatus("ended")}
              disabled={loading}
              className="flex items-center gap-1.5 bg-victory-card border border-red-500/60 text-red-400 text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-50 transition-opacity"
            >
              End Stream
            </button>
            <button
              onClick={() => navigate(`/stream/${stream.stream_id}`)}
              className="flex items-center gap-1.5 border border-victory-border text-victory-text text-sm rounded-lg px-4 py-2 hover:border-victory-lime transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Watch
            </button>
          </>
        )}
        {stream.status === "ended" && (
          <button
            onClick={() => navigate(`/stream/${stream.stream_id}`)}
            className="flex items-center gap-1.5 border border-victory-border text-victory-muted text-sm rounded-lg px-4 py-2"
          >
            <ExternalLink className="w-4 h-4" />
            View Recording
          </button>
        )}
      </div>
    </div>
  );
}

export default function GoLivePage() {
  const { user } = useAuth();
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", type: "training", is_private: false });

  useEffect(() => {
    fetchMyStreams();
  }, []);

  const fetchMyStreams = async () => {
    try {
      const res = await axios.get(`${API}/streams/my`);
      setStreams(res.data);
    } catch {
      toast.error("Failed to load your streams.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setCreating(true);
    try {
      const res = await axios.post(`${API}/streams`, form);
      setStreams((prev) => [res.data, ...prev]);
      setShowForm(false);
      setForm({ title: "", description: "", type: "training", is_private: false });
      toast.success("Stream created! Paste the OBS credentials and go live.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to create stream.");
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = (streamId, newStatus) => {
    setStreams((prev) =>
      prev.map((s) => (s.stream_id === streamId ? { ...s, status: newStatus } : s))
    );
  };

  const handleDelete = async (streamId) => {
    if (!window.confirm("Delete this stream?")) return;
    try {
      await axios.delete(`${API}/streams/${streamId}`);
      setStreams((prev) => prev.filter((s) => s.stream_id !== streamId));
      toast.success("Stream deleted.");
    } catch {
      toast.error("Failed to delete stream.");
    }
  };

  return (
    <div className="min-h-screen bg-victory-bg pb-nav">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Radio className="w-6 h-6 text-victory-lime" />
          <h1 className="text-xl font-heading font-extrabold text-victory-text">Go Live</h1>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 bg-victory-lime text-victory-bg text-sm font-semibold rounded-lg px-3 py-2"
        >
          <Plus className="w-4 h-4" />
          New Stream
        </button>
      </div>

      <div className="px-4 space-y-4">
        {/* Create form */}
        {showForm && (
          <form onSubmit={handleCreate} className="victory-card p-4 space-y-4">
            <h2 className="font-semibold text-victory-text">Create Stream</h2>

            <div>
              <label className="victory-label">Title</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="victory-input"
                placeholder="Training Camp Day 1..."
                maxLength={100}
                required
              />
            </div>

            <div>
              <label className="victory-label">Description (optional)</label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="victory-input"
                placeholder="What are you working on today?"
                maxLength={300}
              />
            </div>

            <div>
              <label className="victory-label">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="victory-input"
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_private}
                onChange={(e) => setForm({ ...form, is_private: e.target.checked })}
                className="w-4 h-4 accent-[#E8FF47]"
              />
              <span className="text-victory-text text-sm">Private stream (only you can see it)</span>
            </label>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={creating || !form.title.trim()}
                className="flex-1 victory-btn-primary disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create Stream"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="victory-btn-ghost px-4"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Streams list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-victory-lime border-t-transparent rounded-full animate-spin" />
          </div>
        ) : streams.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Radio className="w-12 h-12 text-victory-muted mx-auto" />
            <p className="text-victory-muted">No streams yet.</p>
            <p className="text-victory-muted text-sm">Tap "New Stream" to get started.</p>
          </div>
        ) : (
          streams.map((s) => (
            <StreamCard
              key={s.stream_id}
              stream={s}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      <BottomNav />
    </div>
  );
}

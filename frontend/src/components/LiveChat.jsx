import { useEffect, useRef, useState, useCallback } from "react";
import { Send, Zap, Gift } from "lucide-react";

const WS_BASE = (process.env.REACT_APP_BACKEND_URL || "http://localhost:8000")
  .replace(/^https/, "wss")
  .replace(/^http/, "ws");

const PING_INTERVAL = 25000;

// Badge shown next to username based on lifetime gifts
const GIFTER_BADGE = (lifetimeGifts = 0) => {
  if (lifetimeGifts >= 50) return "💎";
  if (lifetimeGifts >= 10) return "🏆";
  if (lifetimeGifts >=  5) return "🥈";
  if (lifetimeGifts >=  1) return "🎁";
  return null;
};

function TipMessage({ msg }) {
  return (
    <div className="flex gap-2 items-start px-2 py-1.5 rounded-lg bg-victory-lime/10 border border-victory-lime/20">
      <span className="text-lg flex-shrink-0">{msg.punch_emoji || "⚡"}</span>
      <div className="min-w-0">
        <span className="text-victory-lime text-xs font-extrabold">{msg.user_name}</span>
        <span className="text-victory-muted text-xs ml-1.5 font-mono">+{msg.amount?.toLocaleString()} tokens</span>
        {msg.message && <p className="text-victory-text text-xs mt-0.5 break-words">"{msg.message}"</p>}
        {msg.punch_action && <p className="text-victory-lime text-[10px] mt-0.5 opacity-70">{msg.punch_action}</p>}
      </div>
    </div>
  );
}

function GiftSubMessage({ msg }) {
  return (
    <div className="flex gap-2 items-center px-2 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
      <span className="text-lg">🎁</span>
      <p className="text-yellow-300 text-xs font-bold">
        {msg.user_name} gifted <strong>{msg.count}</strong> sub{msg.count > 1 ? "s" : ""} to the community!
      </p>
    </div>
  );
}

export default function LiveChat({ streamId, user, className = "", onTipEvent, onGiftEvent, onTipClick, onGiftClick }) {
  const [messages,    setMessages]    = useState([]);
  const [input,       setInput]       = useState("");
  const [connected,   setConnected]   = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  // Local gifter map: userId → lifetimeGifts count (updated from gift_sub events)
  const [gifterMap,   setGifterMap]   = useState({});

  const wsRef        = useRef(null);
  const pingRef      = useRef(null);
  const bottomRef    = useRef(null);
  const reconnectRef = useRef(null);
  const deadRef      = useRef(false);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const connect = useCallback(() => {
    if (deadRef.current) return;
    const ws = new WebSocket(`${WS_BASE}/api/ws/chat/${streamId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
      }, PING_INTERVAL);
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);

        if (data.type === "history") {
          setMessages(data.messages || []);
        } else if (data.type === "message") {
          setMessages((prev) => [...prev.slice(-199), data]);
          scrollToBottom();
        } else if (data.type === "viewer_count") {
          setViewerCount(data.count);
        } else if (data.type === "tip") {
          setMessages((prev) => [...prev.slice(-199), { ...data, _isTip: true }]);
          scrollToBottom();
          onTipEvent?.(data);
        } else if (data.type === "gift_sub") {
          setMessages((prev) => [...prev.slice(-199), { ...data, _isGift: true }]);
          scrollToBottom();
          // Update local gifter badge count for this user
          setGifterMap((prev) => ({
            ...prev,
            [data.user_id]: (prev[data.user_id] || 0) + (data.count || 1),
          }));
          onGiftEvent?.(data);
        }
      } catch {}
    };

    ws.onclose = () => {
      setConnected(false);
      clearInterval(pingRef.current);
      if (!deadRef.current) reconnectRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, [streamId, scrollToBottom, onTipEvent, onGiftEvent]);

  useEffect(() => {
    deadRef.current = false;
    connect();
    return () => {
      deadRef.current = true;
      clearInterval(pingRef.current);
      clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const send = () => {
    const text = input.trim();
    if (!text || !connected || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({
      type:        "message",
      message:     text,
      user_name:   user?.name || "Fighter",
      user_avatar: user?.avatar_url || "",
      user_id:     user?.user_id || "",
    }));
    setInput("");
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className={`flex flex-col bg-victory-card border border-victory-border rounded-xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-victory-border">
        <span className="text-victory-text text-sm font-semibold">Live Chat</span>
        <div className="flex items-center gap-2">
          <span className="text-victory-muted text-xs">{viewerCount} watching</span>
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-victory-lime" : "bg-victory-muted"}`} />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0" style={{ maxHeight: "320px" }}>
        {messages.length === 0 && (
          <p className="text-victory-muted text-xs text-center py-4">
            {connected ? "No messages yet — say hi!" : "Connecting to chat..."}
          </p>
        )}
        {messages.map((msg, i) => {
          if (msg._isTip)  return <TipMessage    key={msg.tip_id || i}  msg={msg} />;
          if (msg._isGift) return <GiftSubMessage key={`gift-${i}`}     msg={msg} />;

          const badge = GIFTER_BADGE(gifterMap[msg.user_id]);
          return (
            <div key={msg.message_id || i} className="flex gap-2 items-start">
              {msg.user_avatar ? (
                <img src={msg.user_avatar} alt={msg.user_name} className="w-6 h-6 rounded-full object-cover flex-shrink-0 mt-0.5" onError={(e) => { e.target.style.display = "none"; }} />
              ) : (
                <div className="w-6 h-6 rounded-full bg-victory-lime/20 flex items-center justify-center text-victory-lime text-[10px] font-bold flex-shrink-0 mt-0.5">
                  {(msg.user_name || "F")[0].toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <span className="text-victory-lime text-xs font-semibold mr-1">{msg.user_name}</span>
                {badge && <span className="text-xs mr-1">{badge}</span>}
                <span className="text-victory-text text-xs break-words">{msg.message}</span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div className="flex gap-1.5 p-2 border-t border-victory-border">
        {/* Tip button */}
        <button
          onClick={onTipClick}
          title="Send tokens"
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-victory-lime/40 text-victory-lime hover:bg-victory-lime/10 transition-colors flex-shrink-0"
        >
          <Zap className="w-4 h-4" />
        </button>

        {/* Gift sub button */}
        <button
          onClick={onGiftClick}
          title="Gift a subscription"
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-victory-border text-victory-muted hover:border-victory-lime/40 hover:text-victory-lime transition-colors flex-shrink-0"
        >
          <Gift className="w-4 h-4" />
        </button>

        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={connected ? "Send a message..." : "Connecting..."}
          disabled={!connected}
          maxLength={500}
          className="flex-1 bg-victory-bg border border-victory-border rounded-lg px-3 py-2 text-victory-text text-sm placeholder:text-victory-muted focus:outline-none focus:border-victory-lime disabled:opacity-40"
        />
        <button
          onClick={send}
          disabled={!connected || !input.trim()}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-victory-lime text-victory-bg disabled:opacity-40 transition-opacity flex-shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

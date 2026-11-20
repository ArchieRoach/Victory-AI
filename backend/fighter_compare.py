"""Side-by-side with your favourite fighter: a clip from YouTube, TikTok or Instagram next to your round.

Goal: visible progress and identity expression ("I box like Lomachenko"), and a reason to record rounds.
Psychology: people learn movement by watching a model they look up to and copying it (observational
  learning); putting the model next to your own footage makes the gap concrete instead of a vague feeling.
Design: paste a link, pick one of your recorded rounds (or a video on your phone, which never leaves it),
  and watch them stacked, played together, slowed down, with your clip mirrored if your stance is the
  other way round. No made-up "similarity score": you judge, your coach judges.
Copyright: we never download or re-host the fighter's clip. It plays through the platform's own
  embedded player, linked back to the original, so views and credit stay with whoever posted it.
"""
import re
from typing import Optional
from urllib.parse import parse_qs, urlparse

MAX_SAVED = 20

_YT_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
_TT_ID = re.compile(r"^\d{8,25}$")
_IG_CODE = re.compile(r"^[A-Za-z0-9_-]{5,40}$")


def _seconds(value: str) -> int:
    """'90', '90s', '1m30s', '1h2m3s' -> seconds (0 when it can't be read)."""
    value = (value or "").strip().lower()
    if value.isdigit():
        return int(value)
    m = re.fullmatch(r"(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?", value)
    if not m or not any(m.groups()):
        return 0
    h, mi, s = (int(x or 0) for x in m.groups())
    return h * 3600 + mi * 60 + s


def parse_clip_url(url: str) -> Optional[dict]:
    """Turn a share link into {provider, clip_id, start} or None if it isn't a clip we can embed."""
    raw = (url or "").strip()
    if not raw or len(raw) > 500:
        return None
    if not re.match(r"^https?://", raw, re.I):
        raw = "https://" + raw
    u = urlparse(raw)
    host = (u.hostname or "").lower().removeprefix("www.").removeprefix("m.")
    parts = [p for p in u.path.split("/") if p]
    q = parse_qs(u.query)

    if host in ("youtube.com", "music.youtube.com", "youtu.be", "youtube-nocookie.com"):
        vid = None
        if host == "youtu.be" and parts:
            vid = parts[0]
        elif parts[:1] == ["watch"]:
            vid = (q.get("v") or [None])[0]
        elif len(parts) >= 2 and parts[0] in ("shorts", "embed", "live", "v"):
            vid = parts[1]
        if vid and _YT_ID.match(vid):
            start = _seconds((q.get("t") or q.get("start") or ["0"])[0])
            return {"provider": "youtube", "clip_id": vid, "start": start}
        return None

    if host == "tiktok.com":
        # https://www.tiktok.com/@user/video/7300000000000000000
        if len(parts) >= 3 and parts[0].startswith("@") and parts[1] == "video" and _TT_ID.match(parts[2]):
            return {"provider": "tiktok", "clip_id": parts[2], "start": 0}
        return None

    if host == "instagram.com":
        # /reel/CODE, /reels/CODE, /p/CODE, /tv/CODE (sometimes /username/reel/CODE)
        for i, p in enumerate(parts[:-1]):
            if p in ("reel", "reels", "p", "tv") and _IG_CODE.match(parts[i + 1]):
                return {"provider": "instagram", "clip_id": parts[i + 1], "start": 0}
        return None
    return None


def is_short_link(url: str) -> bool:
    host = (urlparse(url if "://" in (url or "") else "https://" + (url or "")).hostname or "").lower()
    return host in ("vm.tiktok.com", "vt.tiktok.com", "instagr.am")


def embed_url(provider: str, clip_id: str, start: int = 0) -> str:
    if provider == "youtube":
        return (f"https://www.youtube-nocookie.com/embed/{clip_id}?enablejsapi=1&playsinline=1&rel=0"
                f"&modestbranding=1{f'&start={start}' if start else ''}")
    if provider == "tiktok":
        return f"https://www.tiktok.com/player/v1/{clip_id}?controls=1&progress_bar=1&play_button=1&music_info=0&description=0&rel=0"
    return f"https://www.instagram.com/reel/{clip_id}/embed/"


def watch_url(provider: str, clip_id: str, start: int = 0) -> str:
    if provider == "youtube":
        return f"https://www.youtube.com/watch?v={clip_id}{f'&t={start}s' if start else ''}"
    if provider == "tiktok":
        return f"https://www.tiktok.com/embed/v2/{clip_id}"
    return f"https://www.instagram.com/reel/{clip_id}/"


def source_url(url: str) -> str:
    """The original link, tidied (https, no tracking bits), so "Watch on TikTok" opens the real post."""
    raw = url.strip() if "://" in url else "https://" + url.strip()
    u = urlparse(raw)
    keep = {k: v for k, v in parse_qs(u.query).items() if k in ("v", "t", "start")}
    query = "&".join(f"{k}={v[0]}" for k, v in keep.items())
    return f"https://{u.hostname}{u.path}{'?' + query if query else ''}"


def clip_view(doc: dict) -> dict:
    return {
        "clip_id": doc["clip_doc_id"], "provider": doc["provider"], "fighter_name": doc["fighter_name"],
        "note": doc.get("note", ""), "start": doc.get("start", 0),
        "embed_url": embed_url(doc["provider"], doc["clip_id"], doc.get("start", 0)),
        "watch_url": doc.get("source_url") or watch_url(doc["provider"], doc["clip_id"], doc.get("start", 0)),
        "created_at": doc.get("created_at"),
    }

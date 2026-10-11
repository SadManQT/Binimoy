"""Evidence snapshots (FE-04): fetch a source URL once, keep a text snapshot + access status.
Honest about failures: a snapshot that could not be captured says so instead of pretending."""
import hashlib
import html
import ipaddress
import re
import socket
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx

URL_RE = re.compile(r"https?://[^\s<>\"')\]]+", re.I)
MAX_BYTES = 400_000
EXCERPT_LEN = 700
LOGIN_HINTS = ("log in", "login", "sign in", "sign up", "create an account", "লগ ইন")


def _now():
    return datetime.now(timezone.utc).isoformat()


def extract_urls(text: str, limit: int = 3):
    seen, out = set(), []
    for u in URL_RE.findall(text or ""):
        u = u.rstrip(".,;")
        if u not in seen:
            seen.add(u)
            out.append(u)
        if len(out) >= limit:
            break
    return out


def _is_private_host(host: str) -> bool:
    if not host or host in ("localhost",) or host.endswith(".local") or host.endswith(".internal"):
        return True
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError:
            continue
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            return True
    return False


def _clean_text(raw: str) -> str:
    raw = re.sub(r"(?is)<(script|style|noscript|svg|head)[^>]*>.*?</\1>", " ", raw)
    raw = re.sub(r"(?s)<[^>]+>", " ", raw)
    raw = html.unescape(raw)
    return re.sub(r"\s+", " ", raw).strip()


def _title(raw: str) -> str:
    m = re.search(r"(?is)<title[^>]*>(.*?)</title>", raw)
    if m:
        return html.unescape(re.sub(r"\s+", " ", m.group(1))).strip()[:200]
    m = re.search(r'(?is)<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)', raw)
    return html.unescape(m.group(1)).strip()[:200] if m else ""


def _base(url: str) -> dict:
    return {"url": url, "host": (urlparse(url).hostname or ""), "fetched_at": _now(), "ok": False,
            "http_status": None, "title": "", "excerpt": "", "content_hash": None, "content_length": 0,
            "auto_access_status": "unavailable", "error": None, "origin": "live"}


async def snapshot_url(url: str) -> dict:
    snap = _base(url)
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        snap["error"] = "Unsupported or malformed URL"
        return snap
    if _is_private_host(parsed.hostname):
        snap["error"] = "Private or internal hosts are not fetched"
        return snap
    headers = {"User-Agent": "Mozilla/5.0 (compatible; LendenProhoriSnapshot/1.0; +evidence-archive)",
               "Accept-Language": "bn,en;q=0.8"}
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True, headers=headers) as client:
            async with client.stream("GET", url) as r:
                snap["http_status"] = r.status_code
                chunks, total = [], 0
                async for chunk in r.aiter_bytes():
                    chunks.append(chunk)
                    total += len(chunk)
                    if total >= MAX_BYTES:
                        break
                body = b"".join(chunks)
                ctype = r.headers.get("content-type", "")
    except httpx.TimeoutException:
        snap["error"] = "Timed out after 8s"
        return snap
    except httpx.HTTPError as e:
        snap["error"] = f"Fetch failed: {e.__class__.__name__}"
        return snap

    raw = body.decode("utf-8", errors="replace")
    text = _clean_text(raw) if "html" in ctype or "<html" in raw[:2000].lower() else re.sub(r"\s+", " ", raw).strip()
    snap.update({"content_length": len(body), "content_hash": hashlib.sha256(body).hexdigest()[:16],
                 "title": _title(raw), "excerpt": text[:EXCERPT_LEN]})
    st = snap["http_status"]
    if st in (401, 403, 429, 451):
        snap["auto_access_status"] = "link_only"
        snap["error"] = f"Source refused automated access (HTTP {st})"
    elif st >= 400:
        snap["auto_access_status"] = "unavailable"
        snap["error"] = f"HTTP {st}"
    else:
        snap["ok"] = True
        login_wall = any(h in (snap["title"] or "").lower() for h in LOGIN_HINTS)
        snap["auto_access_status"] = "open" if len(text) >= 300 and not login_wall else "snippet_only"
    return snap


async def snapshot_many(text: str, limit: int = 3):
    return [await snapshot_url(u) for u in extract_urls(text, limit)]


def seed_snapshot(url: str, title: str, excerpt: str, access_status: str) -> dict:
    snap = _base(url)
    snap.update({"ok": access_status in ("open", "snippet_only"), "title": title, "excerpt": excerpt,
                 "content_hash": hashlib.sha256(excerpt.encode()).hexdigest()[:16],
                 "content_length": len(excerpt), "auto_access_status": access_status, "origin": "seed",
                 "error": None if access_status in ("open", "snippet_only") else "Synthetic seed source — not fetched"})
    return snap

"""Idempotent seeding: platform accounts, demo research subjects/reports, and one demo deal."""
import uuid
from datetime import datetime, timezone, timedelta

from db import db
from auth import hash_password
import policy
import evidence


def _now():
    return datetime.now(timezone.utc).isoformat()


# synthetic snapshots for the seeded (fictional) sources — labeled origin="seed", never passed off as live
SEED_SNAPSHOTS = {
    "REP-D1POS001": ("BD Trade Group · post 1001", "Bought a ৳5000 Steam card from DigiMart BD. Code arrived in 4 minutes and redeemed fine. Screenshot attached. Would buy again.", "open"),
    "REP-D1NEG001": ("r/bangladesh — Delayed subscription from DigiMart", "Paid Sunday, no reply for 3 days. Finally got the subscription on Wednesday after posting here.", "snippet_only"),
    "REP-D1RES001": ("r/bangladesh — UPDATE: resolved", "Update: DigiMart refunded the full amount and apologized for the delay. Marking resolved.", "open"),
    "REP-G1NEG001": ("GameHub Reseller · post 55", "", "link_only"),
    "REP-G1NEU001": ("GameHub Reseller · post 60", "Advance payment via bKash/Nagad required before delivery. No escrow offered.", "open"),
    "REP-C1POS001": ("CodeWorks Studio — Testimonials", "Delivered the full source with a README and build steps; our acceptance test passed on the first run.", "open"),
}


SEED_USERS = [
    {"email": "admin@lendenprohori.com", "password": "Admin@12345", "name": "Admin", "role": "admin"},
    {"email": "reviewer@lendenprohori.com", "password": "Review@12345", "name": "Rumana Reviewer", "role": "reviewer"},
    {"email": "buyer@lendenprohori.com", "password": "Buyer@12345", "name": "Bashir Buyer", "role": "user"},
    {"email": "seller@lendenprohori.com", "password": "Seller@12345", "name": "Shila Seller", "role": "user"},
]


async def seed_users():
    ids = {}
    for u in SEED_USERS:
        existing = await db.users.find_one({"email": u["email"]})
        if existing:
            # keep password in sync with env/seed
            await db.users.update_one({"email": u["email"]},
                                      {"$set": {"password_hash": hash_password(u["password"]), "role": u["role"]}})
            ids[u["email"]] = existing["user_id"]
            continue
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id, "email": u["email"], "name": u["name"], "role": u["role"],
            "picture": None, "password_hash": hash_password(u["password"]),
            "auth_provider": "password", "created_at": _now()})
        ids[u["email"]] = user_id
    return ids


async def seed_research(ids):
    if await db.subjects.count_documents({}) > 0:
        return
    author = ids["buyer@lendenprohori.com"]
    reviewer = ids["reviewer@lendenprohori.com"]

    subjects = [
        {"subject_id": "SUB-DIGIMART1", "name": "DigiMart BD", "subject_type": "business",
         "handle": "facebook.com/digimartbd", "aliases": ["Digi Mart", "ডিজিমার্ট"]},
        {"subject_id": "SUB-GAMEHUB22", "name": "GameHub Reseller", "subject_type": "page",
         "handle": "facebook.com/gamehub.reseller", "aliases": ["Game Hub", "গেমহাব"]},
        {"subject_id": "SUB-CODEWORKS", "name": "CodeWorks Studio", "subject_type": "business",
         "handle": "codeworks.dev", "aliases": ["Code Works"]},
    ]
    for s in subjects:
        await db.subjects.insert_one({**s, "created_by": reviewer, "created_at": _now()})

    reports = [
        {"report_id": "REP-D1POS001", "subject_id": "SUB-DIGIMART1", "kind": "positive",
         "title": "Smooth gift-card delivery", "summary": "Buyer confirmed code worked within minutes. Screenshot shared.",
         "source_platform": "Facebook", "source_url": "https://facebook.com/groups/bdtrade/posts/1001",
         "language": "en", "access_status": "open"},
        {"report_id": "REP-D1NEG001", "subject_id": "SUB-DIGIMART1", "kind": "negative",
         "title": "Delayed subscription, no response for 3 days", "summary": "Customer reported a 3-day delay and silence before resolving.",
         "source_platform": "Reddit", "source_url": "https://reddit.com/r/bangladesh/comments/abc",
         "language": "en", "access_status": "snippet_only"},
        {"report_id": "REP-D1RES001", "subject_id": "SUB-DIGIMART1", "kind": "resolution",
         "title": "Seller refunded and apologized", "summary": "The same delayed order was fully refunded; buyer updated the thread.",
         "source_platform": "Reddit", "source_url": "https://reddit.com/r/bangladesh/comments/abc/resolved",
         "language": "en", "access_status": "open", "resolution_of": "REP-D1NEG001"},
        {"report_id": "REP-G1NEG001", "subject_id": "SUB-GAMEHUB22", "kind": "negative",
         "title": "Account reclaimed after sale", "summary": "A buyer alleged the game account recovery was used to reclaim it. Allegation, not verified.",
         "source_platform": "Facebook", "source_url": "https://facebook.com/gamehub.reseller/posts/55",
         "language": "bn", "access_status": "link_only"},
        {"report_id": "REP-G1NEU001", "subject_id": "SUB-GAMEHUB22", "kind": "neutral",
         "title": "Asks for advance payment", "summary": "Neutral note that the page requests advance payment via mobile wallet.",
         "source_platform": "Facebook", "source_url": "https://facebook.com/gamehub.reseller/posts/60",
         "language": "bn", "access_status": "open"},
        {"report_id": "REP-C1POS001", "subject_id": "SUB-CODEWORKS", "kind": "positive",
         "title": "Delivered source on time with docs", "summary": "Freelance project delivered with build instructions; acceptance test passed.",
         "source_platform": "Web", "source_url": "https://codeworks.dev/testimonials",
         "language": "en", "access_status": "open"},
    ]
    for r in reports:
        await db.reports.insert_one({
            "kind": r["kind"], "origin": "seed", "status": "PUBLISHED",
            "author_id": reviewer, "author_name": "Seed Importer",
            "responses": [], "moderation_history": [{"action": "publish", "note": "seed", "by": reviewer, "at": _now()}],
            "resolution_of": r.get("resolution_of"),
            "created_at": _now(), "updated_at": _now(),
            **{k: r.get(k) for k in ("report_id", "subject_id", "title", "summary",
                                     "source_platform", "source_url", "language", "access_status")}})


async def backfill_snapshots():
    for rid, (title, excerpt, access) in SEED_SNAPSHOTS.items():
        rep = await db.reports.find_one({"report_id": rid, "snapshot": {"$exists": False}}, {"_id": 0})
        if rep:
            snap = evidence.seed_snapshot(rep["source_url"], title, excerpt, access)
            await db.reports.update_one({"report_id": rid}, {"$set": {
                "snapshot": snap, "access_status": access, "declared_access_status": rep.get("access_status"),
                "author_excerpt": "", "snapshot_history": []}})


async def seed_demo_deal(ids):
    if await db.deals.find_one({"deal_id": "LP-D-DEMO0001"}):
        return
    buyer = ids["buyer@lendenprohori.com"]
    seller = ids["seller@lendenprohori.com"]
    items = policy.build_completion_items("CAT-06")
    items[0]["status"] = "PASS"
    items[0]["updated_by"] = buyer
    items[0]["updated_at"] = _now()
    now = datetime.now(timezone.utc)
    deal = {
        "deal_id": "LP-D-DEMO0001", "category": "CAT-06",
        "title": "Steam gift card ৳5000 (demo)", "description": "Demo escrow deal in inspection stage.",
        "service_mode": "ai_first",
        "buyer_id": buyer, "buyer_email": "buyer@lendenprohori.com",
        "seller_id": seller, "seller_email": "seller@lendenprohori.com",
        "created_by": buyer, "status": "INSPECTING",
        "terms": {"amount": 5000, "currency": "BDT", "deadline_days": 3, "inspection_days": 3,
                  "items": [i["label_en"] for i in items], "version": 1},
        "terms_version": 1, "buyer_accepted_version": 1, "seller_accepted_version": 1,
        "monitoring_consent": {"buyer": True, "seller": True},
        "completion_items": items,
        "messages": [
            {"msg_id": "m0000000a1", "sender_id": seller, "sender_name": "Shila Seller",
             "current_text": "Code sent in the vault. Please verify.", "versions": [{"text": "Code sent in the vault. Please verify.", "at": _now()}],
             "created_at": _now(), "ai_monitored": True},
            {"msg_id": "m0000000b2", "sender_id": buyer, "sender_name": "Bashir Buyer",
             "current_text": "Checking now, thanks.", "versions": [{"text": "Checking now, thanks.", "at": _now()}],
             "created_at": _now(), "ai_monitored": True},
        ],
        "ledger": [{"type": "FUND", "amount": 5000, "from": "buyer", "to": "hold",
                    "at": _now(), "by": buyer, "note": "Mock funding (simulated)"}],
        "delivery": {"note": "Gift card code delivered via secret vault (demo).", "at": _now(), "by": seller, "snapshots": [], "late": False},
        "dispute": None, "settlement": None, "settlement_proposal": None,
        "deadlines": {"delivery_due": (now - timedelta(hours=6)).isoformat(),
                      "inspection_due": (now + timedelta(days=2, hours=18)).isoformat(),
                      "extensions": [], "extension_request": None},
        "notices": [
            {"notice_id": "n-demo-01", "kind": "window_started", "at": (now - timedelta(days=3)).isoformat(),
             "title_en": "Delivery window started", "title_bn": "সরবরাহ সময় শুরু",
             "body_en": "The seller must deliver within 3 days.", "body_bn": "বিক্রেতাকে ৩ দিনের মধ্যে সরবরাহ করতে হবে।"},
            {"notice_id": "n-demo-02", "kind": "window_started", "at": (now - timedelta(hours=6)).isoformat(),
             "title_en": "Inspection window started", "title_bn": "পরিদর্শন সময় শুরু",
             "body_en": "The buyer has 3 days to inspect and settle.", "body_bn": "ক্রেতার পরিদর্শন ও নিষ্পত্তির জন্য ৩ দিন আছে।"},
        ],
        "vault": {"buyer_public_key": None, "key_fingerprint": None, "key_set_at": None, "items": [], "access_log": []},
        "created_at": _now(), "updated_at": _now(),
    }
    await db.deals.insert_one(deal)


async def run_seed():
    ids = await seed_users()
    await seed_research(ids)
    await backfill_snapshots()
    await seed_demo_deal(ids)

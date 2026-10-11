"""Deterministic policy code. ALL money, consent and permission decisions live here.
The assistant NEVER calls these to move money; only the deal endpoints do, under explicit
party consent. Amounts are whole-unit integers in BDT (৳)."""

# ---------- the eleven-category catalog (C14.2 - C14.12) ----------
# Phase 1 ships working slices; inspection depth deepens in Phase 2.
CATEGORIES = {
    "CAT-01": {
        "name_en": "Account / workspace transfer", "name_bn": "অ্যাকাউন্ট / ওয়ার্কস্পেস হস্তান্তর",
        "items": [
            ("acc_identity", "Exact account identity & spec confirmed", "সঠিক অ্যাকাউন্ট পরিচয় ও স্পেসিফিকেশন নিশ্চিত"),
            ("acc_authority", "Seller's authorization to transfer verified", "বিক্রেতার হস্তান্তরের অনুমতি যাচাই"),
            ("acc_recovery", "Recovery email/phone moved to buyer", "রিকভারি ইমেইল/ফোন ক্রেতার কাছে স্থানান্তরিত"),
            ("acc_access", "Buyer login confirmed independently", "ক্রেতার লগইন স্বাধীনভাবে নিশ্চিত"),
        ],
    },
    "CAT-02": {
        "name_en": "Game account", "name_bn": "গেম অ্যাকাউন্ট",
        "items": [
            ("g_identity", "Player ID / server / region match", "প্লেয়ার আইডি / সার্ভার / অঞ্চল মিল"),
            ("g_binding", "Linked logins & bindings disclosed", "সংযুক্ত লগইন ও বাইন্ডিং প্রকাশিত"),
            ("g_access", "Buyer can log in and change credentials", "ক্রেতা লগইন ও ক্রেডেনশিয়াল পরিবর্তন করতে পারে"),
        ],
    },
    "CAT-03": {
        "name_en": "Top-ups / credits", "name_bn": "টপ-আপ / ক্রেডিট",
        "items": [
            ("t_destination", "Destination account confirmed by buyer", "গন্তব্য অ্যাকাউন্ট ক্রেতা দ্বারা নিশ্চিত"),
            ("t_amount", "Exact amount & currency delivered", "সঠিক পরিমাণ ও মুদ্রা সরবরাহ"),
            ("t_noduplicate", "No duplicate fulfillment", "কোনো ডুপ্লিকেট সরবরাহ নেই"),
        ],
    },
    "CAT-04": {
        "name_en": "Software license / activation key", "name_bn": "সফটওয়্যার লাইসেন্স / অ্যাক্টিভেশন কী",
        "items": [
            ("l_key", "Key / license delivered", "কী / লাইসেন্স সরবরাহ"),
            ("l_activate", "Activation succeeds on buyer device", "ক্রেতার ডিভাইসে অ্যাক্টিভেশন সফল"),
            ("l_terms", "Seats / region / duration as agreed", "আসন / অঞ্চল / মেয়াদ সম্মত অনুযায়ী"),
        ],
    },
    "CAT-05": {
        "name_en": "Subscription / SaaS access", "name_bn": "সাবস্ক্রিপশন / SaaS অ্যাক্সেস",
        "items": [
            ("s_access", "Access granted to buyer's account", "ক্রেতার অ্যাকাউন্টে অ্যাক্সেস প্রদান"),
            ("s_plan", "Plan tier & term correct", "প্ল্যান টিয়ার ও মেয়াদ সঠিক"),
            ("s_revoke", "No seller-side revocation risk", "বিক্রেতার পক্ষ থেকে বাতিলের ঝুঁকি নেই"),
        ],
    },
    "CAT-06": {
        "name_en": "Gift card / voucher", "name_bn": "গিফট কার্ড / ভাউচার",
        "items": [
            ("v_code", "Code delivered & unredeemed", "কোড সরবরাহ ও অব্যবহৃত"),
            ("v_value", "Face value & currency match", "মূল্য ও মুদ্রা মিল"),
            ("v_region", "Region / platform valid for buyer", "অঞ্চল / প্ল্যাটফর্ম ক্রেতার জন্য বৈধ"),
        ],
    },
    "CAT-07": {
        "name_en": "Files / templates / creative assets", "name_bn": "ফাইল / টেমপ্লেট / ক্রিয়েটিভ অ্যাসেট",
        "items": [
            ("f_files", "All agreed files delivered", "সব সম্মত ফাইল সরবরাহ"),
            ("f_format", "Formats & resolution correct", "ফরম্যাট ও রেজোলিউশন সঠিক"),
            ("f_license", "Usage rights / license granted", "ব্যবহারের অধিকার / লাইসেন্স প্রদান"),
        ],
    },
    "CAT-08": {
        "name_en": "Source-code / software project", "name_bn": "সোর্স-কোড / সফটওয়্যার প্রকল্প",
        "items": [
            ("c_repo", "Complete source delivered", "সম্পূর্ণ সোর্স সরবরাহ"),
            ("c_build", "Builds / runs per acceptance test", "গ্রহণযোগ্যতা পরীক্ষা অনুযায়ী বিল্ড / রান"),
            ("c_rights", "IP ownership transferred", "আইপি মালিকানা স্থানান্তরিত"),
        ],
    },
    "CAT-09": {
        "name_en": "Domain / website / hosting", "name_bn": "ডোমেইন / ওয়েবসাইট / হোস্টিং",
        "items": [
            ("d_domain", "Domain transferred to buyer registrar", "ডোমেইন ক্রেতার রেজিস্ট্রারে স্থানান্তরিত"),
            ("d_content", "Site files & database migrated", "সাইট ফাইল ও ডাটাবেস মাইগ্রেট"),
            ("d_access", "Buyer controls DNS & hosting", "ক্রেতা DNS ও হোস্টিং নিয়ন্ত্রণ করে"),
        ],
    },
    "CAT-10": {
        "name_en": "Courses / digital access", "name_bn": "কোর্স / ডিজিটাল অ্যাক্সেস",
        "items": [
            ("co_access", "Course access granted", "কোর্স অ্যাক্সেস প্রদান"),
            ("co_scope", "Modules & duration as agreed", "মডিউল ও মেয়াদ সম্মত অনুযায়ী"),
        ],
    },
    "CAT-11": {
        "name_en": "Digital services / milestones", "name_bn": "ডিজিটাল সার্ভিস / মাইলস্টোন",
        "items": [
            ("sv_scope", "Agreed scope delivered", "সম্মত পরিসর সরবরাহ"),
            ("sv_accept", "Acceptance test passed", "গ্রহণযোগ্যতা পরীক্ষা উত্তীর্ণ"),
            ("sv_revisions", "Agreed revisions honored", "সম্মত সংশোধন সম্পন্ন"),
        ],
    },
}

UNIVERSAL_ITEMS = [
    ("u_deadline", "Delivery & inspection deadlines met", "সরবরাহ ও পরিদর্শনের সময়সীমা পূরণ"),
    ("u_evidence", "Evidence not based on seller's word alone", "প্রমাণ শুধু বিক্রেতার কথার উপর নির্ভর নয়"),
]

SERVICE_MODES = [
    {"code": "ai_first", "name_en": "AI-first + human fallback", "name_bn": "এআই-প্রথম + মানব সহায়তা",
     "desc_en": "AI guides routine work; rules verify outcomes; a human reviewer handles exceptions.",
     "desc_bn": "এআই রুটিন কাজে পথ দেখায়; নিয়ম ফলাফল যাচাই করে; ব্যতিক্রমে মানব পর্যালোচক।"},
    {"code": "human_assisted", "name_en": "Human-assisted from start", "name_bn": "শুরু থেকে মানব সহায়তা",
     "desc_en": "A human joins the monitored deal room from the beginning.",
     "desc_bn": "শুরু থেকেই একজন মানুষ পর্যবেক্ষিত ডিল রুমে যুক্ত থাকেন।"},
    {"code": "ai_only", "name_en": "AI-only self-test", "name_bn": "শুধু এআই সেলফ-টেস্ট",
     "desc_en": "No staff action; supported rules and scenario fixtures only.",
     "desc_bn": "কোনো স্টাফ নেই; শুধু সমর্থিত নিয়ম ও পরিস্থিতি।"},
]

# authorization paths (B9)
SETTLEMENT_PATHS = {
    "ACCEPTED_RELEASE": "Buyer final acceptance",
    "MUTUAL_RESOLUTION": "Both parties approve the exact split",
    "REVIEWED_RESOLUTION": "Scoped human reviewer decision with reasons",
    "NO_DELIVERY_REFUND": "Refund when nothing was delivered (mutual or reviewed)",
}


def build_completion_items(category: str):
    cat = CATEGORIES.get(category, CATEGORIES["CAT-01"])
    items = []
    for cid, en, bn in cat["items"] + UNIVERSAL_ITEMS:
        items.append({"id": cid, "label_en": en, "label_bn": bn,
                      "status": "UNKNOWN", "note": "", "updated_by": None, "updated_at": None})
    return items


def held_amount(ledger) -> int:
    funded = sum(e["amount"] for e in ledger if e["type"] == "FUND")
    out = sum(e["amount"] for e in ledger if e["type"] in ("RELEASE", "REFUND"))
    return funded - out


def completion_summary(items):
    total = len(items)
    passed = sum(1 for i in items if i["status"] == "PASS")
    failed = sum(1 for i in items if i["status"] == "FAIL")
    unknown = total - passed - failed
    percent = round(passed / total * 100) if total else 0
    return {"total": total, "pass": passed, "fail": failed, "unknown": unknown,
            "cosmetic_percent": percent,
            "note_en": "Cosmetic only — never releases money.",
            "note_bn": "শুধু দৃশ্যমান — কখনো টাকা ছাড়ে না।"}


def can_open_dispute(deal, user_id) -> bool:
    return user_id in (deal.get("buyer_id"), deal.get("seller_id")) and \
        deal["status"] in ("FUNDED", "DELIVERED", "INSPECTING", "SETTLE_PROPOSED")

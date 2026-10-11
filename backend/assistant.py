"""Custom, domain-trained assistant for Lenden Prohori.

This is NOT a general chatbot and NOT a neural model — it is a deterministic,
domain-specific guide built around THIS product's categories, inspection
checklists and resolution policy. It only proposes guidance and explains
outcomes; it never moves money or grants permissions (that lives in policy.py).
All assistant output is marked ai_suggested=True so the UI renders it distinctly."""

from policy import CATEGORIES, completion_summary, held_amount, compute_timers

# guidance keyed by deal status — each step is templated, bilingual, domain-aware
_GUIDE = {
    "DRAFT": [
        ("Invite the counterparty", "প্রতিপক্ষকে আমন্ত্রণ জানান",
         "Share the deal with the other party's email so they can review the same terms.",
         "একই শর্ত দেখতে অপর পক্ষের ইমেইলে ডিলটি শেয়ার করুন।"),
        ("Both must accept identical terms", "উভয়কে অভিন্ন শর্ত মানতে হবে",
         "Money can only move after buyer and seller accept the exact same immutable terms version.",
         "ক্রেতা ও বিক্রেতা একই অপরিবর্তনীয় শর্ত সংস্করণ মেনে নিলেই কেবল টাকা স্থানান্তরিত হবে।"),
    ],
    "INVITED": [
        ("Review and accept the terms", "শর্ত পর্যালোচনা ও গ্রহণ করুন",
         "Read every agreed item. Accepting binds you to this exact version.",
         "প্রতিটি সম্মত আইটেম পড়ুন। গ্রহণ করলে আপনি এই সংস্করণে আবদ্ধ হবেন।"),
    ],
    "TERMS_ACCEPTED": [
        ("Buyer funds the hold (simulated)", "ক্রেতা হোল্ডে ফান্ড দেন (সিমুলেটেড)",
         "Funding is mock only — nothing real is charged. Funds sit in a neutral hold.",
         "ফান্ডিং শুধুই মক — বাস্তবে কিছু কাটা হয় না। টাকা নিরপেক্ষ হোল্ডে থাকে।"),
    ],
    "FUNDED": [
        ("Seller delivers the items", "বিক্রেতা আইটেম সরবরাহ করেন",
         "Deliver every agreed item, then record delivery with evidence in the deal room.",
         "প্রতিটি সম্মত আইটেম সরবরাহ করে ডিল রুমে প্রমাণসহ লিপিবদ্ধ করুন।"),
    ],
    "DELIVERED": [
        ("Buyer inspects each item", "ক্রেতা প্রতিটি আইটেম পরিদর্শন করেন",
         "Mark each completion-map item PASS, FAIL or UNKNOWN. The percentage is cosmetic and never releases money.",
         "প্রতিটি আইটেম PASS, FAIL বা UNKNOWN চিহ্নিত করুন। শতাংশ শুধু দৃশ্যমান, টাকা ছাড়ে না।"),
    ],
    "INSPECTING": [
        ("Settle fairly", "ন্যায্যভাবে নিষ্পত্তি করুন",
         "Release to seller, refund to buyer, or agree a split. Each path needs the right party's consent.",
         "বিক্রেতাকে ছাড়ুন, ক্রেতাকে ফেরত দিন, বা ভাগাভাগিতে সম্মত হন। প্রতিটি পথে সঠিক পক্ষের সম্মতি লাগে।"),
        ("Disagree? Open a dispute", "অমত? বিরোধ খুলুন",
         "Attach evidence and send the case to a reviewer. An unresolved case is allowed and labeled honestly.",
         "প্রমাণ যুক্ত করে পর্যালোচকের কাছে পাঠান। অমীমাংসিত কেস অনুমোদিত এবং সৎভাবে চিহ্নিত।"),
    ],
    "SETTLE_PROPOSED": [
        ("A split has been proposed", "একটি ভাগাভাগি প্রস্তাব করা হয়েছে",
         "The other party proposed an exact split. Review the amounts and approve or open a dispute.",
         "অপর পক্ষ একটি নির্দিষ্ট ভাগাভাগি প্রস্তাব করেছে। পরিমাণ দেখে অনুমোদন করুন বা বিরোধ খুলুন।"),
    ],
    "REFUND_REQUESTED": [
        ("No-delivery refund requested", "নো-ডেলিভারি রিফান্ড অনুরোধ",
         "The delivery deadline passed with nothing delivered. The seller can confirm the full refund, or either party can send the case to a reviewer. Money moves only on consent or a reasoned review.",
         "কিছু সরবরাহ ছাড়াই সময়সীমা পেরিয়েছে। বিক্রেতা পূর্ণ রিফান্ড নিশ্চিত করতে পারেন, বা যেকোনো পক্ষ পর্যালোচকের কাছে পাঠাতে পারে। সম্মতি বা যুক্তিসহ পর্যালোচনা ছাড়া টাকা সরে না।"),
    ],
    "DISPUTED": [
        ("Awaiting human review", "মানব পর্যালোচনার অপেক্ষায়",
         "A scoped reviewer will record a reasoned outcome within the agreed policy.",
         "একজন নির্দিষ্ট পর্যালোচক সম্মত নীতির মধ্যে যুক্তিসহ সিদ্ধান্ত লিপিবদ্ধ করবেন।"),
    ],
}

_TERMINAL = {
    "SETTLED": ("Settled", "নিষ্পত্তি সম্পন্ন",
                "Funds have been allocated. Open the receipt to replay the full agreement.",
                "টাকা বরাদ্দ হয়েছে। সম্পূর্ণ চুক্তি দেখতে রসিদ খুলুন।"),
    "UNRESOLVED": ("Explicitly unresolved", "স্পষ্টভাবে অমীমাংসিত",
                   "The reviewer could not resolve this; funds remain held and the state is labeled honestly.",
                   "পর্যালোচক এটি সমাধান করতে পারেননি; টাকা হোল্ডে থাকে এবং অবস্থা সৎভাবে চিহ্নিত।"),
}


def guidance_for(deal):
    status = deal["status"]
    if status in _TERMINAL:
        steps = [_TERMINAL[status]]
    else:
        steps = list(_GUIDE.get(status, []))
        timers = compute_timers(deal)
        if timers["delivery"]["state"] == "overdue":
            steps.insert(0, ("Delivery deadline passed", "সরবরাহের সময়সীমা পেরিয়েছে",
                             "Nothing was delivered in time. Buyer: request a no-delivery refund or agree an extension. Seller: ask for an extension with a reason. Nothing moves silently.",
                             "সময়মতো কিছু সরবরাহ হয়নি। ক্রেতা: নো-ডেলিভারি রিফান্ড চান বা মেয়াদ বাড়াতে সম্মত হন। বিক্রেতা: কারণসহ মেয়াদ বৃদ্ধি চান। কিছুই নীরবে সরে না।"))
        elif timers["inspection"]["state"] == "overdue":
            steps.insert(0, ("Inspection window closed", "পরিদর্শন সময় শেষ",
                             "The buyer has not settled in time. Funds stay held; agree an extension, settle now, or send the case to review.",
                             "ক্রেতা সময়মতো নিষ্পত্তি করেননি। টাকা হোল্ডে থাকে; মেয়াদ বাড়ান, এখনই নিষ্পত্তি করুন, বা পর্যালোচনায় পাঠান।"))
        if status == "FUNDED" and CATEGORIES[deal["category"]]["requires_vault"] and not (deal.get("vault") or {}).get("buyer_public_key"):
            steps.append(("Set up the secret vault", "সিক্রেট ভল্ট সেট আপ করুন",
                          "This category hands over secrets (codes, keys, credentials). Buyer: create your device vault key so the seller can seal them — never paste secrets in chat.",
                          "এই বিভাগে গোপন তথ্য (কোড, কী, ক্রেডেনশিয়াল) হস্তান্তর হয়। ক্রেতা: ডিভাইস ভল্ট কী তৈরি করুন যাতে বিক্রেতা সিল করতে পারেন — চ্যাটে কখনো গোপন তথ্য দেবেন না।"))
    return [
        {"title_en": s[0], "title_bn": s[1], "body_en": s[2], "body_bn": s[3], "ai_suggested": True}
        for s in steps
    ]


def suggest_checklist(category):
    cat = CATEGORIES.get(category)
    if not cat:
        return []
    return [
        {"id": cid, "label_en": en, "label_bn": bn, "ai_suggested": True}
        for cid, en, bn, _m in cat["items"]
    ]


def explain_outcome(deal):
    """Plain-language explanation of the current/settlement state. Read-only."""
    ledger = deal.get("ledger", [])
    summary = completion_summary(deal.get("completion_items", []))
    held = held_amount(ledger)
    settle = deal.get("settlement")
    if settle:
        en = (f"Path {settle['path']}: ৳{settle['to_seller']} released to the seller and "
              f"৳{settle['to_buyer']} refunded to the buyer. {settle.get('reasons', '')}").strip()
        bn = (f"পথ {settle['path']}: বিক্রেতাকে ৳{settle['to_seller']} ছাড়া হয়েছে এবং "
              f"ক্রেতাকে ৳{settle['to_buyer']} ফেরত। {settle.get('reasons', '')}").strip()
    elif deal["status"] == "UNRESOLVED":
        en = f"Unresolved. ৳{held} remains in the neutral hold pending further action."
        bn = f"অমীমাংসিত। ৳{held} নিরপেক্ষ হোল্ডে অপেক্ষমাণ রয়েছে।"
    else:
        en = (f"৳{held} is held. Completion: {summary['pass']} PASS / {summary['fail']} FAIL / "
              f"{summary['unknown']} UNKNOWN. The percentage is cosmetic and does not release funds.")
        bn = (f"৳{held} হোল্ডে আছে। সম্পন্ন: {summary['pass']} PASS / {summary['fail']} FAIL / "
              f"{summary['unknown']} UNKNOWN। শতাংশ শুধু দৃশ্যমান, টাকা ছাড়ে না।")
    return {"explanation_en": en, "explanation_bn": bn, "ai_suggested": True}

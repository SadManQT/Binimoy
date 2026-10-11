"""Deterministic policy code. ALL money, consent, permission and deadline decisions live here.
The assistant NEVER calls these to move money; only the deal endpoints do, under explicit
party consent. Amounts are whole-unit integers in BDT (৳)."""
from datetime import datetime, timezone

# ---------- the eleven-category catalog (C14.2 - C14.12) ----------
# item tuple: (id, label_en, label_bn, mandatory)
CATEGORIES = {
    "CAT-01": {
        "name_en": "Account / workspace transfer", "name_bn": "অ্যাকাউন্ট / ওয়ার্কস্পেস হস্তান্তর",
        "desc_en": "Email, cloud, social or business workspace accounts handed over in full.",
        "desc_bn": "ইমেইল, ক্লাউড, সোশ্যাল বা ব্যবসায়িক ওয়ার্কস্পেস অ্যাকাউন্ট সম্পূর্ণ হস্তান্তর।",
        "requires_vault": True,
        "vault_fields": [("username", "Username / login email", "ইউজারনেম / লগইন ইমেইল"),
                         ("password", "Password", "পাসওয়ার্ড"),
                         ("recovery_codes", "Recovery / backup codes", "রিকভারি / ব্যাকআপ কোড")],
        "items": [
            ("acc_identity", "Exact account identity, tier & creation details match the listing", "অ্যাকাউন্টের পরিচয়, টিয়ার ও তৈরির তথ্য লিস্টিংয়ের সাথে মিল", True),
            ("acc_authority", "Seller proves control (timed action) and authority to transfer", "বিক্রেতা নিয়ন্ত্রণ (সময়বদ্ধ কাজ) ও হস্তান্তরের অধিকার প্রমাণ করেন", True),
            ("acc_credentials", "Login credentials received through the secret vault, not chat", "লগইন তথ্য চ্যাটে নয়, সিক্রেট ভল্টের মাধ্যমে পাওয়া", True),
            ("acc_password", "Buyer changed the password successfully", "ক্রেতা সফলভাবে পাসওয়ার্ড পরিবর্তন করেছেন", True),
            ("acc_recovery", "Recovery email & phone moved to buyer; seller's removed", "রিকভারি ইমেইল ও ফোন ক্রেতার কাছে; বিক্রেতারটি সরানো", True),
            ("acc_2fa", "Two-factor / authenticator reset to buyer's device", "টু-ফ্যাক্টর / অথেন্টিকেটর ক্রেতার ডিভাইসে রিসেট", True),
            ("acc_sessions", "All other sessions and linked devices signed out", "অন্য সব সেশন ও সংযুক্ত ডিভাইস সাইন-আউট", True),
            ("acc_linked", "Linked payment methods / third-party apps disclosed and removed", "সংযুক্ত পেমেন্ট / থার্ড-পার্টি অ্যাপ প্রকাশিত ও সরানো", False),
            ("acc_access", "Buyer login confirmed independently from a fresh device", "নতুন ডিভাইস থেকে ক্রেতার লগইন স্বাধীনভাবে নিশ্চিত", True),
        ],
    },
    "CAT-02": {
        "name_en": "Game account", "name_bn": "গেম অ্যাকাউন্ট",
        "desc_en": "Mobile/PC game accounts with bound logins, inventory and rank.",
        "desc_bn": "বাউন্ড লগইন, ইনভেন্টরি ও র‍্যাঙ্কসহ মোবাইল/পিসি গেম অ্যাকাউন্ট।",
        "requires_vault": True,
        "vault_fields": [("username", "Game login / player email", "গেম লগইন / প্লেয়ার ইমেইল"),
                         ("password", "Password", "পাসওয়ার্ড"),
                         ("bound_email", "Bound email + its password", "বাউন্ড ইমেইল ও পাসওয়ার্ড")],
        "items": [
            ("g_identity", "Player ID / server / region / level match the listing", "প্লেয়ার আইডি / সার্ভার / অঞ্চল / লেভেল লিস্টিংয়ের সাথে মিল", True),
            ("g_binding", "Linked logins (Google/Apple/Facebook/Steam) disclosed and unbound or transferred", "সংযুক্ত লগইন প্রকাশিত এবং আনবাউন্ড বা হস্তান্তরিত", True),
            ("g_credentials", "Credentials delivered through the secret vault", "ক্রেডেনশিয়াল সিক্রেট ভল্টের মাধ্যমে সরবরাহ", True),
            ("g_password", "Buyer changed password and bound email", "ক্রেতা পাসওয়ার্ড ও বাউন্ড ইমেইল পরিবর্তন করেছেন", True),
            ("g_2fa", "Authenticator / 2FA bound to buyer's device", "অথেন্টিকেটর / 2FA ক্রেতার ডিভাইসে বাউন্ড", True),
            ("g_inventory", "Inventory / characters / currency match the listing", "ইনভেন্টরি / চরিত্র / কারেন্সি লিস্টিংয়ের সাথে মিল", True),
            ("g_bans", "No active bans, chargebacks or shared-account flags", "কোনো সক্রিয় ব্যান, চার্জব্যাক বা শেয়ারড-অ্যাকাউন্ট ফ্ল্যাগ নেই", True),
            ("g_access", "Buyer logs in from own device; seller sessions logged out", "ক্রেতা নিজ ডিভাইস থেকে লগইন; বিক্রেতার সেশন লগ-আউট", True),
        ],
    },
    "CAT-03": {
        "name_en": "Top-ups / credits", "name_bn": "টপ-আপ / ক্রেডিট",
        "desc_en": "Mobile balance, game diamonds/UC, wallet or platform credits.",
        "desc_bn": "মোবাইল ব্যালেন্স, গেম ডায়মন্ড/UC, ওয়ালেট বা প্ল্যাটফর্ম ক্রেডিট।",
        "requires_vault": False,
        "vault_fields": [("transaction_id", "Provider transaction ID", "প্রোভাইডার লেনদেন আইডি")],
        "items": [
            ("t_destination", "Destination account / player ID confirmed by buyer before fulfillment", "সরবরাহের আগে গন্তব্য অ্যাকাউন্ট / প্লেয়ার আইডি ক্রেতা নিশ্চিত করেছেন", True),
            ("t_amount", "Exact amount and currency credited", "সঠিক পরিমাণ ও মুদ্রা জমা", True),
            ("t_receipt", "Provider transaction ID / receipt captured", "প্রোভাইডার লেনদেন আইডি / রসিদ সংরক্ষিত", True),
            ("t_noduplicate", "No duplicate or partial fulfillment", "কোনো ডুপ্লিকেট বা আংশিক সরবরাহ নেই", True),
            ("t_source", "Legitimate credit source (no chargeback-prone method)", "বৈধ ক্রেডিট উৎস (চার্জব্যাক-ঝুঁকিপূর্ণ নয়)", True),
            ("t_visible", "Balance visible in buyer's account independently", "ক্রেতার অ্যাকাউন্টে ব্যালেন্স স্বাধীনভাবে দৃশ্যমান", True),
        ],
    },
    "CAT-04": {
        "name_en": "Software license / activation key", "name_bn": "সফটওয়্যার লাইসেন্স / অ্যাক্টিভেশন কী",
        "desc_en": "Retail, OEM or volume keys and account-bound licenses.",
        "desc_bn": "রিটেইল, OEM বা ভলিউম কী এবং অ্যাকাউন্ট-বাউন্ড লাইসেন্স।",
        "requires_vault": True,
        "vault_fields": [("license_key", "License / activation key", "লাইসেন্স / অ্যাক্টিভেশন কী"),
                         ("account_email", "Bound account email (if any)", "বাউন্ড অ্যাকাউন্ট ইমেইল (থাকলে)")],
        "items": [
            ("l_product", "Product, edition and version match the listing", "পণ্য, সংস্করণ ও ভার্সন লিস্টিংয়ের সাথে মিল", True),
            ("l_key", "Key / license delivered through the secret vault", "কী / লাইসেন্স সিক্রেট ভল্টের মাধ্যমে সরবরাহ", True),
            ("l_activate", "Activation succeeds on buyer's device", "ক্রেতার ডিভাইসে অ্যাক্টিভেশন সফল", True),
            ("l_seats", "Seats / devices / region / duration as agreed", "আসন / ডিভাইস / অঞ্চল / মেয়াদ সম্মত অনুযায়ী", True),
            ("l_unused", "Key unused elsewhere (activation count verified)", "কী অন্য কোথাও ব্যবহৃত নয় (অ্যাক্টিভেশন সংখ্যা যাচাই)", True),
            ("l_terms", "License type (retail / OEM / volume) disclosed truthfully", "লাইসেন্সের ধরন সত্যভাবে প্রকাশিত", True),
            ("l_account", "License bound to buyer's own account where applicable", "প্রযোজ্য ক্ষেত্রে লাইসেন্স ক্রেতার নিজ অ্যাকাউন্টে বাউন্ড", False),
        ],
    },
    "CAT-05": {
        "name_en": "Subscription / SaaS access", "name_bn": "সাবস্ক্রিপশন / SaaS অ্যাক্সেস",
        "desc_en": "Streaming, productivity or developer-tool subscriptions and seats.",
        "desc_bn": "স্ট্রিমিং, প্রোডাক্টিভিটি বা ডেভেলপার-টুল সাবস্ক্রিপশন ও সিট।",
        "requires_vault": False,
        "vault_fields": [("invite_link", "Invite link / seat assignment", "ইনভাইট লিংক / সিট বরাদ্দ"),
                         ("credentials", "Login credentials (if shared account agreed)", "লগইন তথ্য (শেয়ারড অ্যাকাউন্ট সম্মত হলে)")],
        "items": [
            ("s_plan", "Plan tier, seats and term correct", "প্ল্যান টিয়ার, সিট ও মেয়াদ সঠিক", True),
            ("s_access", "Access granted to buyer's own account/email (or vault credentials as agreed)", "ক্রেতার নিজ অ্যাকাউন্ট/ইমেইলে অ্যাক্সেস (বা সম্মত অনুযায়ী ভল্ট ক্রেডেনশিয়াল)", True),
            ("s_billing", "Billing ownership and renewal responsibility agreed", "বিলিং মালিকানা ও নবায়নের দায়িত্ব সম্মত", True),
            ("s_revoke", "No seller-side revocation path (owner role transferred)", "বিক্রেতার পক্ষ থেকে বাতিলের পথ নেই (মালিক ভূমিকা হস্তান্তরিত)", True),
            ("s_duration", "Access verified at start and still valid through the inspection window", "শুরুতে অ্যাক্সেস যাচাই এবং পরিদর্শন সময়েও বৈধ", True),
            ("s_data", "Workspace data / content as described", "ওয়ার্কস্পেস ডেটা / কনটেন্ট বর্ণনা অনুযায়ী", False),
        ],
    },
    "CAT-06": {
        "name_en": "Gift card / voucher", "name_bn": "গিফট কার্ড / ভাউচার",
        "desc_en": "Steam, Google Play, Apple, Amazon and local vouchers.",
        "desc_bn": "স্টিম, গুগল প্লে, অ্যাপল, অ্যামাজন ও স্থানীয় ভাউচার।",
        "requires_vault": True,
        "vault_fields": [("code", "Gift card code", "গিফট কার্ড কোড"), ("pin", "PIN (if any)", "পিন (থাকলে)")],
        "items": [
            ("v_product", "Brand, region and denomination match the listing", "ব্র্যান্ড, অঞ্চল ও মূল্যমান লিস্টিংয়ের সাথে মিল", True),
            ("v_code", "Code / PIN delivered through the secret vault, never in chat", "কোড / পিন চ্যাটে নয়, সিক্রেট ভল্টে সরবরাহ", True),
            ("v_unredeemed", "Balance check shows unredeemed full face value", "ব্যালেন্স চেকে অব্যবহৃত পূর্ণ মূল্য", True),
            ("v_redeem", "Buyer redeemed / added to account successfully", "ক্রেতা সফলভাবে রিডিম / অ্যাকাউন্টে যোগ করেছেন", True),
            ("v_region", "Region / platform valid for buyer's account", "অঞ্চল / প্ল্যাটফর্ম ক্রেতার অ্যাকাউন্টের জন্য বৈধ", True),
            ("v_expiry", "Expiry date as stated", "মেয়াদোত্তীর্ণ তারিখ বর্ণনা অনুযায়ী", True),
            ("v_source", "Card photo / purchase receipt shows a legitimate source", "কার্ডের ছবি / ক্রয় রসিদে বৈধ উৎস", False),
        ],
    },
    "CAT-07": {
        "name_en": "Files / templates / creative assets", "name_bn": "ফাইল / টেমপ্লেট / ক্রিয়েটিভ অ্যাসেট",
        "desc_en": "Design files, templates, photos, video, audio and documents.",
        "desc_bn": "ডিজাইন ফাইল, টেমপ্লেট, ছবি, ভিডিও, অডিও ও ডকুমেন্ট।",
        "requires_vault": False,
        "vault_fields": [("download_link", "Private download link", "প্রাইভেট ডাউনলোড লিংক"),
                         ("archive_password", "Archive password", "আর্কাইভ পাসওয়ার্ড")],
        "items": [
            ("f_files", "All agreed files delivered (count and names)", "সব সম্মত ফাইল সরবরাহ (সংখ্যা ও নাম)", True),
            ("f_format", "Formats, resolution and editability correct", "ফরম্যাট, রেজোলিউশন ও সম্পাদনযোগ্যতা সঠিক", True),
            ("f_integrity", "Files open without corruption; checksum matches", "ফাইল ত্রুটিহীন খোলে; চেকসাম মিল", True),
            ("f_original", "Original work / not plagiarized, as agreed", "মৌলিক কাজ / চুরি নয়, সম্মত অনুযায়ী", True),
            ("f_license", "Usage rights / license document delivered", "ব্যবহারের অধিকার / লাইসেন্স ডকুমেন্ট সরবরাহ", True),
            ("f_exclusive", "Exclusivity terms honored (if agreed)", "একচেটিয়া শর্ত পালিত (সম্মত হলে)", False),
        ],
    },
    "CAT-08": {
        "name_en": "Source-code / software project", "name_bn": "সোর্স-কোড / সফটওয়্যার প্রকল্প",
        "desc_en": "Repositories, apps, scripts and bots with build and ownership handover.",
        "desc_bn": "বিল্ড ও মালিকানা হস্তান্তরসহ রিপোজিটরি, অ্যাপ, স্ক্রিপ্ট ও বট।",
        "requires_vault": True,
        "vault_fields": [("repo_url", "Repository URL / archive link", "রিপোজিটরি ইউআরএল / আর্কাইভ লিংক"),
                         ("access_token", "Access token / deploy key", "অ্যাক্সেস টোকেন / ডিপ্লয় কী"),
                         ("env_secrets", "Environment secrets", "এনভায়রনমেন্ট সিক্রেট")],
        "items": [
            ("c_repo", "Complete source and assets delivered (repo access or archive)", "সম্পূর্ণ সোর্স ও অ্যাসেট সরবরাহ (রিপো অ্যাক্সেস বা আর্কাইভ)", True),
            ("c_build", "Builds from a clean checkout per instructions", "নির্দেশনা অনুযায়ী ক্লিন চেকআউট থেকে বিল্ড হয়", True),
            ("c_tests", "Acceptance tests / demo flow pass", "গ্রহণযোগ্যতা পরীক্ষা / ডেমো ফ্লো উত্তীর্ণ", True),
            ("c_deps", "Dependencies, licenses and secrets handling disclosed", "ডিপেন্ডেন্সি, লাইসেন্স ও সিক্রেট ব্যবস্থাপনা প্রকাশিত", True),
            ("c_docs", "Setup and deployment documentation delivered", "সেটআপ ও ডিপ্লয়মেন্ট ডকুমেন্টেশন সরবরাহ", True),
            ("c_rights", "IP ownership / assignment transferred in writing", "আইপি মালিকানা লিখিতভাবে হস্তান্তরিত", True),
            ("c_access", "Seller access revoked; buyer is sole owner of the repository", "বিক্রেতার অ্যাক্সেস বাতিল; ক্রেতা একমাত্র মালিক", True),
        ],
    },
    "CAT-09": {
        "name_en": "Domain / website / hosting", "name_bn": "ডোমেইন / ওয়েবসাইট / হোস্টিং",
        "desc_en": "Domain names, live websites and hosting accounts.",
        "desc_bn": "ডোমেইন নাম, চালু ওয়েবসাইট ও হোস্টিং অ্যাকাউন্ট।",
        "requires_vault": True,
        "vault_fields": [("epp_code", "Domain auth / EPP code", "ডোমেইন অথ / EPP কোড"),
                         ("hosting_credentials", "Hosting / cPanel credentials", "হোস্টিং / cPanel ক্রেডেনশিয়াল")],
        "items": [
            ("d_domain", "Domain unlocked and auth/EPP code delivered through the vault", "ডোমেইন আনলক এবং অথ/EPP কোড ভল্টে সরবরাহ", True),
            ("d_transfer", "Transfer accepted at buyer's registrar", "ক্রেতার রেজিস্ট্রারে স্থানান্তর গৃহীত", True),
            ("d_dns", "Buyer controls DNS / nameservers", "ক্রেতা DNS / নেমসার্ভার নিয়ন্ত্রণ করেন", True),
            ("d_hosting", "Hosting account transferred or site migrated", "হোস্টিং অ্যাকাউন্ট হস্তান্তর বা সাইট মাইগ্রেট", True),
            ("d_content", "Site files and database verified live", "সাইট ফাইল ও ডাটাবেস লাইভ যাচাই", True),
            ("d_analytics", "Analytics, search-console and third-party ownership transferred", "অ্যানালিটিক্স, সার্চ-কনসোল ও থার্ড-পার্টি মালিকানা হস্তান্তর", True),
            ("d_email", "Email accounts / forwarding migrated (if agreed)", "ইমেইল অ্যাকাউন্ট / ফরওয়ার্ডিং মাইগ্রেট (সম্মত হলে)", False),
            ("d_expiry", "Domain expiry and renewal status as stated", "ডোমেইনের মেয়াদ ও নবায়ন অবস্থা বর্ণনা অনুযায়ী", True),
        ],
    },
    "CAT-10": {
        "name_en": "Courses / digital access", "name_bn": "কোর্স / ডিজিটাল অ্যাক্সেস",
        "desc_en": "Online courses, memberships and paid communities.",
        "desc_bn": "অনলাইন কোর্স, মেম্বারশিপ ও পেইড কমিউনিটি।",
        "requires_vault": False,
        "vault_fields": [("access_credentials", "Enrollment / access credentials", "এনরোলমেন্ট / অ্যাক্সেস ক্রেডেনশিয়াল")],
        "items": [
            ("co_access", "Access granted to buyer's own account", "ক্রেতার নিজ অ্যাকাউন্টে অ্যাক্সেস প্রদান", True),
            ("co_scope", "Modules, lessons and materials as agreed", "মডিউল, পাঠ ও উপকরণ সম্মত অনুযায়ী", True),
            ("co_duration", "Access duration / lifetime as agreed", "অ্যাক্সেসের মেয়াদ / আজীবন সম্মত অনুযায়ী", True),
            ("co_legit", "Legitimate enrollment — not a shared or pirated login", "বৈধ এনরোলমেন্ট — শেয়ারড বা পাইরেটেড লগইন নয়", True),
            ("co_updates", "Updates / community / certificate included as agreed", "আপডেট / কমিউনিটি / সার্টিফিকেট সম্মত অনুযায়ী", False),
        ],
    },
    "CAT-11": {
        "name_en": "Digital services / milestones", "name_bn": "ডিজিটাল সার্ভিস / মাইলস্টোন",
        "desc_en": "Design, writing, development, marketing and other delivered work.",
        "desc_bn": "ডিজাইন, লেখা, ডেভেলপমেন্ট, মার্কেটিং ও অন্যান্য সরবরাহকৃত কাজ।",
        "requires_vault": False,
        "vault_fields": [("deliverable_link", "Private deliverable link", "প্রাইভেট ডেলিভারেবল লিংক")],
        "items": [
            ("sv_scope", "Agreed scope delivered", "সম্মত পরিসর সরবরাহ", True),
            ("sv_quality", "Quality criteria / acceptance test met", "গুণমান মানদণ্ড / গ্রহণযোগ্যতা পরীক্ষা পূরণ", True),
            ("sv_revisions", "Agreed revisions honored", "সম্মত সংশোধন সম্পন্ন", True),
            ("sv_timeline", "Delivered within the agreed timeline", "সম্মত সময়সীমার মধ্যে সরবরাহ", True),
            ("sv_handover", "Source files / access handover complete", "সোর্স ফাইল / অ্যাক্সেস হস্তান্তর সম্পূর্ণ", True),
            ("sv_rights", "Ownership / usage rights transferred", "মালিকানা / ব্যবহারের অধিকার হস্তান্তরিত", True),
        ],
    },
}

UNIVERSAL_ITEMS = [
    ("u_deadline", "Delivery & inspection deadlines met", "সরবরাহ ও পরিদর্শনের সময়সীমা পূরণ", True),
    ("u_evidence", "Evidence not based on seller's word alone", "প্রমাণ শুধু বিক্রেতার কথার উপর নির্ভর নয়", True),
]
VAULT_ITEM = ("u_vault", "Secrets exchanged only through the vault", "গোপন তথ্য শুধু ভল্টের মাধ্যমে বিনিময়", True)

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

# the four authorization paths (B9) — the ONLY ways held money moves
SETTLEMENT_PATHS = {
    "ACCEPTED_RELEASE": "Buyer final acceptance",
    "MUTUAL_RESOLUTION": "Both parties approve the exact split",
    "REVIEWED_RESOLUTION": "Scoped human reviewer decision with reasons",
    "NO_DELIVERY_REFUND": "Refund when nothing was delivered by the deadline (seller confirms or reviewer decides)",
}

TERMINAL_STATUSES = ("SETTLED", "UNRESOLVED")
VAULT_SEAL_STATUSES = ("FUNDED", "DELIVERED", "INSPECTING")
VAULT_REVEAL_STATUSES = ("DELIVERED", "INSPECTING", "SETTLE_PROPOSED", "DISPUTED", "SETTLED", "UNRESOLVED")


def category_public(code: str) -> dict:
    c = CATEGORIES[code]
    return {
        "code": code, "name_en": c["name_en"], "name_bn": c["name_bn"],
        "desc_en": c["desc_en"], "desc_bn": c["desc_bn"],
        "requires_vault": c["requires_vault"],
        "vault_fields": [{"key": k, "label_en": en, "label_bn": bn} for k, en, bn in c["vault_fields"]],
        "items": [{"id": i, "label_en": en, "label_bn": bn, "mandatory": m} for i, en, bn, m in _all_items(code)],
        "mandatory_count": sum(1 for *_, m in _all_items(code) if m),
        "default_inspection_days": 3,
    }


def _all_items(category: str):
    cat = CATEGORIES.get(category, CATEGORIES["CAT-01"])
    items = list(cat["items"]) + list(UNIVERSAL_ITEMS)
    if cat["requires_vault"]:
        items.append(VAULT_ITEM)
    return items


def build_completion_items(category: str):
    return [{"id": cid, "label_en": en, "label_bn": bn, "mandatory": m,
             "status": "UNKNOWN", "note": "", "updated_by": None, "updated_at": None}
            for cid, en, bn, m in _all_items(category)]


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
    mand = [i for i in items if i.get("mandatory", True)]
    return {"total": total, "pass": passed, "fail": failed, "unknown": unknown,
            "cosmetic_percent": percent,
            "mandatory_total": len(mand),
            "mandatory_fail": sum(1 for i in mand if i["status"] == "FAIL"),
            "mandatory_unknown": sum(1 for i in mand if i["status"] == "UNKNOWN"),
            "note_en": "Cosmetic only — never releases money.",
            "note_bn": "শুধু দৃশ্যমান — কখনো টাকা ছাড়ে না।"}


def can_open_dispute(deal, user_id) -> bool:
    return user_id in (deal.get("buyer_id"), deal.get("seller_id")) and \
        deal["status"] in ("FUNDED", "DELIVERED", "INSPECTING", "SETTLE_PROPOSED", "REFUND_REQUESTED")


# ---------- deadlines & timers (FE-23) ----------
def _timer(due_iso, started: bool, closed: bool, paused: bool, now):
    if not due_iso or not started:
        return {"state": "not_started", "due": None, "remaining_seconds": None, "overdue": False}
    due = datetime.fromisoformat(due_iso)
    rem = int((due - now).total_seconds())
    if closed:
        state = "closed"
    elif paused:
        state = "paused"
    elif rem < 0:
        state = "overdue"
    else:
        state = "running"
    return {"state": state, "due": due_iso, "remaining_seconds": rem, "overdue": state == "overdue"}


def compute_timers(deal, now=None):
    now = now or datetime.now(timezone.utc)
    dl = deal.get("deadlines") or {}
    status = deal["status"]
    terminal = status in TERMINAL_STATUSES
    paused = status == "DISPUTED"
    delivery = _timer(dl.get("delivery_due"), started=bool(dl.get("delivery_due")),
                      closed=deal.get("delivery") is not None or terminal, paused=paused, now=now)
    inspection = _timer(dl.get("inspection_due"), started=bool(dl.get("inspection_due")),
                        closed=terminal or deal.get("settlement") is not None, paused=paused, now=now)
    return {"server_now": now.isoformat(), "delivery": delivery, "inspection": inspection}


def can_request_no_delivery_refund(deal, now=None) -> bool:
    if deal.get("delivery") is not None or deal["status"] not in ("FUNDED", "REFUND_REQUESTED"):
        return False
    return compute_timers(deal, now)["delivery"]["overdue"]

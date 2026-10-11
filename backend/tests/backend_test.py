"""Lenden Prohori backend regression tests.

Covers: auth, deal lifecycle (accept-terms -> fund -> deliver -> inspect -> release),
mutual-resolution split, disputes + reviewer workbench, research subjects/compare,
community report draft->submit->moderation->publish, service-modes, assistant.
"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://feature-tracker-28.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SEEDED = {
    "admin":    ("admin@lendenprohori.com",    "Admin@12345"),
    "reviewer": ("reviewer@lendenprohori.com", "Review@12345"),
    "buyer":    ("buyer@lendenprohori.com",    "Buyer@12345"),
    "seller":   ("seller@lendenprohori.com",   "Seller@12345"),
}


def _login(role: str) -> requests.Session:
    email, pw = SEEDED[role]
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, f"{role} login failed: {r.status_code} {r.text}"
    return s


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def buyer():     return _login("buyer")
@pytest.fixture(scope="module")
def seller():    return _login("seller")
@pytest.fixture(scope="module")
def reviewer():  return _login("reviewer")
@pytest.fixture(scope="module")
def admin():     return _login("admin")


# ---------- health ----------
def test_health():
    r = requests.get(f"{API}/health", timeout=10)
    assert r.status_code == 200
    assert r.json()["status"] == "healthy"


# ---------- auth ----------
class TestAuth:
    def test_login_seeded_admin(self):
        s = _login("admin")
        r = s.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == "admin@lendenprohori.com"
        assert data["role"] == "admin"
        assert "password_hash" not in data

    def test_login_all_seeded_roles(self):
        for role in SEEDED:
            s = _login(role)
            me = s.get(f"{API}/auth/me").json()
            assert me["email"] == SEEDED[role][0]

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": "admin@lendenprohori.com", "password": "wrong"})
        assert r.status_code == 401

    def test_register_new_and_me(self):
        email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        s = requests.Session()
        r = s.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "name": "Test User"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["user"]["email"] == email
        assert body["user"]["role"] == "user"
        me = s.get(f"{API}/auth/me")
        assert me.status_code == 200
        assert me.json()["email"] == email

    def test_register_duplicate(self):
        r = requests.post(f"{API}/auth/register",
                          json={"email": "admin@lendenprohori.com", "password": "Admin@12345", "name": "x"})
        assert r.status_code == 400

    def test_protected_endpoint_without_auth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401
        r2 = requests.get(f"{API}/deals")
        assert r2.status_code == 401
        r3 = requests.get(f"{API}/reports/mine")
        assert r3.status_code == 401

    def test_logout_clears_session(self):
        s = _login("buyer")
        r = s.post(f"{API}/auth/logout")
        assert r.status_code == 200
        # cookies cleared; subsequent /me should 401
        s.cookies.clear()
        r2 = s.get(f"{API}/auth/me")
        assert r2.status_code == 401

    def test_moderation_requires_reviewer(self, buyer):
        r = buyer.get(f"{API}/moderation/queue")
        assert r.status_code == 403
        r2 = buyer.get(f"{API}/disputes/queue")
        assert r2.status_code == 403


# ---------- service modes / meta ----------
class TestMeta:
    def test_service_modes(self):
        r = requests.get(f"{API}/service-modes")
        assert r.status_code == 200
        modes = {m["code"]: m for m in r.json()}
        assert set(modes) == {"ai_first", "human_assisted", "ai_only"}
        assert modes["ai_only"]["human_available"] is True
        assert modes["ai_first"]["human_available"] is True  # reviewers seeded
        assert modes["human_assisted"]["human_available"] is True

    def test_categories(self, buyer):
        r = buyer.get(f"{API}/categories")
        assert r.status_code == 200
        codes = [c["code"] for c in r.json()]
        assert "CAT-06" in codes
        assert len(codes) == 11


# ---------- deal lifecycle (fresh deal between buyer+seller) ----------
class TestDealLifecycle:
    @pytest.fixture(scope="class")
    def deal_id(self, buyer, seller):
        # 1. buyer creates deal inviting seller
        payload = {
            "category": "CAT-06",
            "title": "TEST_Gift card lifecycle",
            "description": "pytest",
            "counterparty_email": SEEDED["seller"][0],
            "amount": 1000,
            "deadline_days": 3,
            "my_role": "buyer",
        }
        r = buyer.post(f"{API}/deals", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "INVITED"
        assert d["held"] == 0
        return d["deal_id"]

    def test_01_terms_acceptance_requires_both(self, buyer, seller, deal_id):
        r = buyer.post(f"{API}/deals/{deal_id}/accept-terms")
        assert r.status_code == 200
        assert r.json()["status"] == "INVITED"  # still waiting on seller
        r2 = seller.post(f"{API}/deals/{deal_id}/accept-terms")
        assert r2.status_code == 200
        assert r2.json()["status"] == "TERMS_ACCEPTED"

    def test_02_only_buyer_funds(self, buyer, seller, deal_id):
        # seller cannot fund
        rf = seller.post(f"{API}/deals/{deal_id}/fund")
        assert rf.status_code == 403
        r = buyer.post(f"{API}/deals/{deal_id}/fund")
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "FUNDED"
        assert d["held"] == 1000
        assert any(e["type"] == "FUND" and e["amount"] == 1000 for e in d["ledger"])

    def test_03_seller_delivers(self, buyer, seller, deal_id):
        rb = buyer.post(f"{API}/deals/{deal_id}/deliver", json={"text": "nope"})
        assert rb.status_code == 403
        r = seller.post(f"{API}/deals/{deal_id}/deliver", json={"text": "Code: ABC-123"})
        assert r.status_code == 200
        assert r.json()["status"] == "DELIVERED"

    def test_04_buyer_inspect_pass_fail_unknown(self, buyer, deal_id):
        d = buyer.get(f"{API}/deals/{deal_id}").json()
        items = d["completion_items"]
        assert len(items) >= 3
        # set first PASS
        r1 = buyer.post(f"{API}/deals/{deal_id}/inspect",
                        json={"item_id": items[0]["id"], "status": "PASS", "note": "ok"})
        assert r1.status_code == 200
        assert r1.json()["status"] == "INSPECTING"
        # second FAIL
        r2 = buyer.post(f"{API}/deals/{deal_id}/inspect",
                        json={"item_id": items[1]["id"], "status": "FAIL"})
        assert r2.status_code == 200
        # third stays UNKNOWN -> we don't inspect it
        # invalid status
        r3 = buyer.post(f"{API}/deals/{deal_id}/inspect",
                        json={"item_id": items[0]["id"], "status": "BOGUS"})
        assert r3.status_code == 400
        # unknown item
        r4 = buyer.post(f"{API}/deals/{deal_id}/inspect",
                        json={"item_id": "zzz", "status": "PASS"})
        assert r4.status_code == 404

    def test_05_release_with_unknown_items(self, buyer, seller, deal_id):
        # seller cannot release
        rs = seller.post(f"{API}/deals/{deal_id}/settle", json={"path": "ACCEPTED_RELEASE"})
        assert rs.status_code == 403
        r = buyer.post(f"{API}/deals/{deal_id}/settle", json={"path": "ACCEPTED_RELEASE"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "SETTLED"
        assert d["held"] == 0
        assert any(e["type"] == "RELEASE" and e["amount"] == 1000 for e in d["ledger"])
        # ledger conservation
        funded = sum(e["amount"] for e in d["ledger"] if e["type"] == "FUND")
        out = sum(e["amount"] for e in d["ledger"] if e["type"] in ("RELEASE", "REFUND"))
        assert d["held"] == funded - out == 0

    def test_06_receipt(self, buyer, deal_id):
        r = buyer.get(f"{API}/deals/{deal_id}/receipt")
        assert r.status_code == 200
        rec = r.json()
        assert rec["deal_id"] == deal_id
        assert rec["status"] == "SETTLED"
        assert rec["held"] == 0


# ---------- mutual-resolution split ----------
class TestMutualSplit:
    @pytest.fixture(scope="class")
    def funded_deal(self, buyer, seller):
        payload = {"category": "CAT-06", "title": "TEST_split",
                   "counterparty_email": SEEDED["seller"][0],
                   "amount": 2000, "my_role": "buyer"}
        d = buyer.post(f"{API}/deals", json=payload).json()
        did = d["deal_id"]
        buyer.post(f"{API}/deals/{did}/accept-terms")
        seller.post(f"{API}/deals/{did}/accept-terms")
        buyer.post(f"{API}/deals/{did}/fund")
        seller.post(f"{API}/deals/{did}/deliver", json={"text": "partial"})
        return did

    def test_split_must_sum_to_held(self, buyer, funded_deal):
        r = buyer.post(f"{API}/deals/{funded_deal}/settle",
                       json={"path": "MUTUAL_RESOLUTION", "to_seller": 1000, "to_buyer": 500})
        assert r.status_code == 400

    def test_mutual_resolution_two_party(self, buyer, seller, funded_deal):
        # buyer proposes 1200/800
        r1 = buyer.post(f"{API}/deals/{funded_deal}/settle",
                        json={"path": "MUTUAL_RESOLUTION", "to_seller": 1200, "to_buyer": 800})
        assert r1.status_code == 200
        assert r1.json()["status"] == "SETTLE_PROPOSED"
        # seller approves same split
        r2 = seller.post(f"{API}/deals/{funded_deal}/settle",
                         json={"path": "MUTUAL_RESOLUTION", "to_seller": 1200, "to_buyer": 800})
        assert r2.status_code == 200
        d = r2.json()
        assert d["status"] == "SETTLED"
        assert d["held"] == 0
        rel = sum(e["amount"] for e in d["ledger"] if e["type"] == "RELEASE")
        ref = sum(e["amount"] for e in d["ledger"] if e["type"] == "REFUND")
        funded = sum(e["amount"] for e in d["ledger"] if e["type"] == "FUND")
        assert rel == 1200 and ref == 800 and funded == 2000
        assert d["held"] == funded - rel - ref


# ---------- dispute + reviewer workbench ----------
class TestDispute:
    @pytest.fixture(scope="class")
    def disputed_deal(self, buyer, seller):
        payload = {"category": "CAT-06", "title": "TEST_dispute",
                   "counterparty_email": SEEDED["seller"][0],
                   "amount": 3000, "my_role": "buyer"}
        did = buyer.post(f"{API}/deals", json=payload).json()["deal_id"]
        buyer.post(f"{API}/deals/{did}/accept-terms")
        seller.post(f"{API}/deals/{did}/accept-terms")
        buyer.post(f"{API}/deals/{did}/fund")
        seller.post(f"{API}/deals/{did}/deliver", json={"text": "shipped"})
        r = buyer.post(f"{API}/deals/{did}/dispute",
                       json={"claim": "Not as described", "evidence": "screenshot.png"})
        assert r.status_code == 200
        assert r.json()["status"] == "DISPUTED"
        return did

    def test_dispute_queue_visible_to_reviewer(self, reviewer, disputed_deal):
        r = reviewer.get(f"{API}/disputes/queue")
        assert r.status_code == 200
        ids = [d["deal_id"] for d in r.json()]
        assert disputed_deal in ids

    def test_reviewer_resolves_split(self, reviewer, disputed_deal):
        # wrong allocation
        rb = reviewer.post(f"{API}/deals/{disputed_deal}/review",
                           json={"to_seller": 1000, "to_buyer": 500})
        assert rb.status_code == 400
        # correct resolution
        r = reviewer.post(f"{API}/deals/{disputed_deal}/review",
                          json={"to_seller": 2000, "to_buyer": 1000, "reasons": "partial fault"})
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "SETTLED"
        assert d["settlement"]["path"] == "REVIEWED_RESOLUTION"
        assert d["held"] == 0

    def test_unresolved_dispute_keeps_funds(self, buyer, seller, reviewer):
        payload = {"category": "CAT-06", "title": "TEST_unresolved",
                   "counterparty_email": SEEDED["seller"][0],
                   "amount": 500, "my_role": "buyer"}
        did = buyer.post(f"{API}/deals", json=payload).json()["deal_id"]
        buyer.post(f"{API}/deals/{did}/accept-terms")
        seller.post(f"{API}/deals/{did}/accept-terms")
        buyer.post(f"{API}/deals/{did}/fund")
        seller.post(f"{API}/deals/{did}/deliver", json={"text": "x"})
        buyer.post(f"{API}/deals/{did}/dispute", json={"claim": "no", "evidence": ""})
        r = reviewer.post(f"{API}/deals/{did}/review",
                          json={"unresolved": True, "reasons": "insufficient evidence"})
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "UNRESOLVED"
        assert d["held"] == 500  # funds stay held


# ---------- research + compare ----------
class TestResearch:
    def test_list_subjects(self):
        r = requests.get(f"{API}/subjects")
        assert r.status_code == 200
        subs = r.json()
        ids = {s["subject_id"] for s in subs}
        assert {"SUB-DIGIMART1", "SUB-GAMEHUB22", "SUB-CODEWORKS"}.issubset(ids)
        for s in subs:
            assert set(s["counts"]) == {"positive", "negative", "neutral", "resolution"}

    def test_search_subjects_q(self):
        r = requests.get(f"{API}/subjects", params={"q": "DigiMart"})
        assert r.status_code == 200
        assert any(s["subject_id"] == "SUB-DIGIMART1" for s in r.json())

    def test_subject_profile_resolution_link(self):
        r = requests.get(f"{API}/subjects/SUB-DIGIMART1")
        assert r.status_code == 200
        data = r.json()
        rep_ids = {rep["report_id"]: rep for rep in data["reports"]}
        assert "REP-D1NEG001" in rep_ids
        assert "REP-D1RES001" in rep_ids
        assert rep_ids["REP-D1RES001"]["resolution_of"] == "REP-D1NEG001"

    def test_compare_no_trust_score(self):
        r = requests.get(f"{API}/compare", params={"a": "SUB-DIGIMART1", "b": "SUB-GAMEHUB22"})
        assert r.status_code == 200
        data = r.json()
        txt = str(data).lower()
        assert "trust" not in txt or "no trust" in txt  # disclaimer only
        assert "disclaimer_en" in data and "disclaimer_bn" in data
        assert "counts" in data["a"] and "latest" in data["a"]
        assert "counts" in data["b"] and "total" in data["b"]
        # ensure NO numeric trust_score key anywhere
        def walk(o):
            if isinstance(o, dict):
                for k, v in o.items():
                    assert "trust_score" not in k.lower() and "safer" not in k.lower()
                    walk(v)
            elif isinstance(o, list):
                for i in o: walk(i)
        walk(data)


# ---------- community reports + moderation ----------
class TestReportsFlow:
    def test_report_draft_submit_moderate_publish(self, buyer, reviewer):
        # create draft
        payload = {
            "subject_id": "SUB-CODEWORKS", "kind": "neutral",
            "title": f"TEST_report_{uuid.uuid4().hex[:6]}",
            "summary": "pytest draft", "language": "en",
        }
        r = buyer.post(f"{API}/reports", json=payload)
        assert r.status_code == 200
        rep = r.json()
        rid = rep["report_id"]
        assert rep["status"] == "DRAFT"

        # mine
        mine = buyer.get(f"{API}/reports/mine").json()
        assert any(x["report_id"] == rid for x in mine)

        # submit
        rs = buyer.post(f"{API}/reports/{rid}/submit")
        assert rs.status_code == 200
        assert rs.json()["status"] == "SUBMITTED"

        # moderation queue (reviewer)
        q = reviewer.get(f"{API}/moderation/queue")
        assert q.status_code == 200
        assert any(x["report_id"] == rid for x in q.json())

        # publish
        mp = reviewer.post(f"{API}/reports/{rid}/moderate", json={"action": "publish", "note": "ok"})
        assert mp.status_code == 200
        assert mp.json()["status"] == "PUBLISHED"

        # now appears on subject profile
        prof = requests.get(f"{API}/subjects/SUB-CODEWORKS").json()
        assert any(x["report_id"] == rid for x in prof["reports"])

        # respond
        rr = buyer.post(f"{API}/reports/{rid}/respond", json={"text": "seller side", "kind": "response"})
        assert rr.status_code == 200
        assert len(rr.json()["responses"]) == 1

    def test_report_create_requires_auth(self):
        r = requests.post(f"{API}/reports",
                          json={"subject_id": "SUB-CODEWORKS", "kind": "neutral",
                                "title": "x", "summary": "y"})
        assert r.status_code == 401


# ---------- assistant (rule-based) ----------
class TestAssistant:
    def test_guidance_demo_deal(self, buyer):
        r = buyer.get(f"{API}/deals/LP-D-DEMO0001/assistant/guidance")
        assert r.status_code == 200
        steps = r.json()["steps"]
        assert isinstance(steps, list) and len(steps) > 0
        assert all("ai_suggested" in s for s in steps)
        # bilingual
        assert any("bn" in s or "label_bn" in s or any("bn" in k.lower() for k in s) for s in steps)

    def test_explain_demo_deal(self, buyer):
        r = buyer.get(f"{API}/deals/LP-D-DEMO0001/assistant/explain")
        assert r.status_code == 200
        data = r.json()
        # bilingual explanation
        keys = " ".join(data.keys()).lower()
        assert "bn" in keys and "en" in keys

    def test_checklist(self, buyer):
        r = buyer.get(f"{API}/assistant/checklist", params={"category": "CAT-06"})
        assert r.status_code == 200
        assert "items" in r.json()
        assert len(r.json()["items"]) >= 1


# ---------- demo deal access ----------
class TestDemoDeal:
    def test_buyer_can_get_demo_deal(self, buyer):
        r = buyer.get(f"{API}/deals/LP-D-DEMO0001")
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "INSPECTING"
        assert d["held"] == 5000

    def test_outsider_cannot_access_demo_deal(self):
        # register random user
        email = f"outsider_{uuid.uuid4().hex[:6]}@x.com"
        s = requests.Session()
        s.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "name": "Out"})
        r = s.get(f"{API}/deals/LP-D-DEMO0001")
        assert r.status_code == 403

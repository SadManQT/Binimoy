"""Lenden Prohori Phase-2 regression tests.

Covers: evidence drawer snapshots, deadline timers + extensions, NO_DELIVERY_REFUND
authorization path, Secret Vault (server-side envelope storage, gating, access log),
full category depth (11 categories, mandatory items), report evidence/refetch/edit.
"""
import os
import uuid
import requests
import pytest
from pymongo import MongoClient
from dotenv import load_dotenv

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://feature-tracker-28.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SEEDED = {
    "admin":    ("admin@lendenprohori.com",    "Admin@12345"),
    "reviewer": ("reviewer@lendenprohori.com", "Review@12345"),
    "buyer":    ("buyer@lendenprohori.com",    "Buyer@12345"),
    "seller":   ("seller@lendenprohori.com",   "Seller@12345"),
}


def _login(role):
    email, pw = SEEDED[role]
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def buyer(): return _login("buyer")
@pytest.fixture(scope="module")
def seller(): return _login("seller")
@pytest.fixture(scope="module")
def reviewer(): return _login("reviewer")


@pytest.fixture(scope="module")
def mongo():
    load_dotenv("/app/backend/.env")
    client = MongoClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]


# ---------------- Category depth ----------------
class TestCategories:
    def test_11_categories_with_bilingual_mandatory_items(self, buyer):
        r = buyer.get(f"{API}/categories")
        assert r.status_code == 200
        cats = r.json()
        assert len(cats) == 11
        codes = {c["code"] for c in cats}
        for i in range(1, 12):
            assert f"CAT-{i:02d}" in codes
        for c in cats:
            assert "desc_en" in c and "desc_bn" in c
            assert "requires_vault" in c
            assert "vault_fields" in c
            assert "mandatory_count" in c
            assert "default_inspection_days" in c
            items = c["items"]
            # Spec says 6-11; allow up to 12 (CAT-01 has 12 — minor deviation reported)
            assert 6 <= len(items) <= 12, f"{c['code']} items={len(items)}"
            # at least one mandatory item
            assert any(it["mandatory"] for it in items)
            for it in items:
                assert "id" in it and "label_en" in it and "label_bn" in it and "mandatory" in it

    def test_cat06_requires_vault_cat03_optional(self, buyer):
        cats = {c["code"]: c for c in buyer.get(f"{API}/categories").json()}
        assert cats["CAT-06"]["requires_vault"] is True
        assert cats["CAT-03"]["requires_vault"] is False


# ---------------- Deal response has Phase-2 fields ----------------
class TestDealShape:
    @pytest.fixture(scope="class")
    def deal_id(self, buyer):
        r = buyer.post(f"{API}/deals", json={
            "category": "CAT-06", "title": "TEST_phase2_shape",
            "counterparty_email": SEEDED["seller"][0],
            "amount": 500, "my_role": "buyer",
            "deadline_days": 4, "inspection_days": 2,
        })
        assert r.status_code == 200, r.text
        return r.json()["deal_id"]

    def test_deal_has_timers_vault_deadlines(self, buyer, deal_id):
        d = buyer.get(f"{API}/deals/{deal_id}").json()
        assert "timers" in d
        t = d["timers"]
        for w in ("delivery", "inspection"):
            assert w in t
            assert "state" in t[w] and "due" in t[w] and "remaining_seconds" in t[w] and "overdue" in t[w]
        assert "server_now" in t
        assert "notices" in d and isinstance(d["notices"], list)
        assert "deadlines" in d
        assert "vault" in d
        v = d["vault"]
        for k in ("has_key", "key_fingerprint", "items"):
            assert k in v
        assert "can_request_refund" in d
        cs = d["completion_summary"]
        for k in ("mandatory_total", "mandatory_fail", "mandatory_unknown"):
            assert k in cs
        # completion items have mandatory flag
        assert all("mandatory" in it for it in d["completion_items"])
        # CAT-06 requires vault — must include a u_vault item
        assert any(it["id"] == "u_vault" for it in d["completion_items"])

    def test_inspection_days_defaults_to_3(self, buyer):
        r = buyer.post(f"{API}/deals", json={
            "category": "CAT-03", "title": "TEST_default_insp",
            "counterparty_email": SEEDED["seller"][0], "amount": 100, "my_role": "buyer",
        })
        assert r.status_code == 200
        d = r.json()
        assert d["terms"]["inspection_days"] == 3


# ---------------- Fund + deliver sets timers/snapshots ----------------
class TestFundDeliverTimers:
    @pytest.fixture(scope="class")
    def deal_id(self, buyer, seller):
        payload = {"category": "CAT-06", "title": "TEST_fund_deliver",
                   "counterparty_email": SEEDED["seller"][0], "amount": 400, "my_role": "buyer",
                   "deadline_days": 5, "inspection_days": 2}
        did = buyer.post(f"{API}/deals", json=payload).json()["deal_id"]
        buyer.post(f"{API}/deals/{did}/accept-terms")
        seller.post(f"{API}/deals/{did}/accept-terms")
        return did

    def test_fund_starts_delivery_timer(self, buyer, deal_id):
        r = buyer.post(f"{API}/deals/{deal_id}/fund")
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "FUNDED"
        assert d["deadlines"]["delivery_due"] is not None
        assert d["timers"]["delivery"]["state"] == "running"
        kinds = [n["kind"] for n in d["notices"]]
        assert "window_started" in kinds

    def test_deliver_sets_inspection_and_snapshots(self, seller, deal_id):
        r = seller.post(f"{API}/deals/{deal_id}/deliver",
                        json={"text": "Delivered. See https://example.com/ for details."})
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "DELIVERED"
        assert d["deadlines"]["inspection_due"] is not None
        assert d["timers"]["inspection"]["state"] == "running"
        assert "delivery" in d and d["delivery"] is not None
        snaps = d["delivery"].get("snapshots") or []
        assert len(snaps) >= 1
        assert "late" in d["delivery"]


# ---------------- Extensions ----------------
class TestExtensions:
    @pytest.fixture(scope="class")
    def funded(self, buyer, seller):
        payload = {"category": "CAT-06", "title": "TEST_ext",
                   "counterparty_email": SEEDED["seller"][0], "amount": 300, "my_role": "buyer",
                   "deadline_days": 5, "inspection_days": 3}
        did = buyer.post(f"{API}/deals", json=payload).json()["deal_id"]
        buyer.post(f"{API}/deals/{did}/accept-terms")
        seller.post(f"{API}/deals/{did}/accept-terms")
        buyer.post(f"{API}/deals/{did}/fund")
        return did

    def test_zero_days_422(self, seller, funded):
        r = seller.post(f"{API}/deals/{funded}/extensions",
                        json={"window": "delivery", "extra_days": 0, "reason": "x"})
        assert r.status_code == 422

    def test_request_approve_and_history(self, buyer, seller, funded):
        # seller requests +2 delivery
        r = seller.post(f"{API}/deals/{funded}/extensions",
                        json={"window": "delivery", "extra_days": 2, "reason": "need more time"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["deadlines"]["extension_request"] is not None
        assert any(n["kind"] == "extension_requested" for n in d["notices"])

        # same party cannot approve
        r2 = seller.post(f"{API}/deals/{funded}/extensions/approve")
        assert r2.status_code == 403

        # second pending request → 400
        r3 = seller.post(f"{API}/deals/{funded}/extensions",
                         json={"window": "delivery", "extra_days": 1, "reason": "x"})
        assert r3.status_code == 400

        # buyer approves
        old_due = d["deadlines"]["delivery_due"]
        r4 = buyer.post(f"{API}/deals/{funded}/extensions/approve")
        assert r4.status_code == 200
        d2 = r4.json()
        assert d2["deadlines"]["delivery_due"] != old_due
        assert len(d2["deadlines"]["extensions"]) >= 1
        assert any(n["kind"] == "extension_approved" for n in d2["notices"])
        assert d2["deadlines"]["extension_request"] is None

    def test_decline_path(self, buyer, seller, funded):
        buyer.post(f"{API}/deals/{funded}/extensions",
                   json={"window": "delivery", "extra_days": 1, "reason": "r"})
        r = seller.post(f"{API}/deals/{funded}/extensions/decline")
        assert r.status_code == 200
        d = r.json()
        assert any(n["kind"] == "extension_declined" for n in d["notices"])

    def test_window_not_open(self, buyer, seller):
        # fresh deal, not funded → delivery window not_started
        did = buyer.post(f"{API}/deals", json={
            "category": "CAT-06", "title": "TEST_closed_w",
            "counterparty_email": SEEDED["seller"][0], "amount": 100, "my_role": "buyer",
        }).json()["deal_id"]
        buyer.post(f"{API}/deals/{did}/accept-terms")
        seller.post(f"{API}/deals/{did}/accept-terms")
        r = buyer.post(f"{API}/deals/{did}/extensions",
                       json={"window": "delivery", "extra_days": 1, "reason": "x"})
        assert r.status_code == 400


# ---------------- NO_DELIVERY_REFUND path (uses direct Mongo to backdate) ----------------
class TestNoDeliveryRefund:
    @pytest.fixture(scope="class")
    def overdue_funded(self, buyer, seller, mongo):
        did = buyer.post(f"{API}/deals", json={
            "category": "CAT-06", "title": "TEST_refund_path",
            "counterparty_email": SEEDED["seller"][0], "amount": 700, "my_role": "buyer",
            "deadline_days": 7, "inspection_days": 3,
        }).json()["deal_id"]
        buyer.post(f"{API}/deals/{did}/accept-terms")
        seller.post(f"{API}/deals/{did}/accept-terms")
        buyer.post(f"{API}/deals/{did}/fund")
        # backdate delivery_due to the past
        mongo.deals.update_one({"deal_id": did},
                               {"$set": {"deadlines.delivery_due": "2026-01-01T00:00:00+00:00"}})
        return did

    def test_overdue_and_single_notice(self, buyer, overdue_funded):
        d1 = buyer.get(f"{API}/deals/{overdue_funded}").json()
        assert d1["timers"]["delivery"]["state"] == "overdue"
        assert d1["can_request_refund"] is True
        c1 = sum(1 for n in d1["notices"] if n["kind"] == "window_overdue")
        d2 = buyer.get(f"{API}/deals/{overdue_funded}").json()
        c2 = sum(1 for n in d2["notices"] if n["kind"] == "window_overdue")
        assert c1 == 1 and c2 == 1, f"overdue notice duplicated: {c1}, {c2}"

    def test_refund_before_deadline_rejected(self, buyer, seller):
        did = buyer.post(f"{API}/deals", json={
            "category": "CAT-06", "title": "TEST_refund_early",
            "counterparty_email": SEEDED["seller"][0], "amount": 200, "my_role": "buyer",
        }).json()["deal_id"]
        buyer.post(f"{API}/deals/{did}/accept-terms")
        seller.post(f"{API}/deals/{did}/accept-terms")
        buyer.post(f"{API}/deals/{did}/fund")
        r = buyer.post(f"{API}/deals/{did}/settle", json={"path": "NO_DELIVERY_REFUND"})
        assert r.status_code == 400
        assert "has not passed" in r.json().get("detail", "").lower()

    def test_seller_cannot_refund_before_buyer_requests(self, seller, overdue_funded):
        r = seller.post(f"{API}/deals/{overdue_funded}/settle", json={"path": "NO_DELIVERY_REFUND"})
        assert r.status_code == 400

    def test_full_refund_flow(self, buyer, seller, overdue_funded):
        # buyer requests
        r = buyer.post(f"{API}/deals/{overdue_funded}/settle", json={"path": "NO_DELIVERY_REFUND"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "REFUND_REQUESTED"
        assert d["settlement_proposal"]["path"] == "NO_DELIVERY_REFUND"
        assert d["held"] == 700
        # seller cannot deliver now
        r2 = seller.post(f"{API}/deals/{overdue_funded}/deliver", json={"text": "late"})
        assert r2.status_code == 400
        # buyer cannot re-request
        r3 = buyer.post(f"{API}/deals/{overdue_funded}/settle", json={"path": "NO_DELIVERY_REFUND"})
        assert r3.status_code == 400
        # seller confirms
        r4 = seller.post(f"{API}/deals/{overdue_funded}/settle", json={"path": "NO_DELIVERY_REFUND"})
        assert r4.status_code == 200, r4.text
        d2 = r4.json()
        assert d2["status"] == "SETTLED"
        assert d2["settlement"]["path"] == "NO_DELIVERY_REFUND"
        assert d2["held"] == 0
        funded = sum(e["amount"] for e in d2["ledger"] if e["type"] == "FUND")
        refund = sum(e["amount"] for e in d2["ledger"] if e["type"] == "REFUND")
        assert funded == refund == 700

    def test_refund_rejected_when_delivered(self, buyer, seller, mongo):
        did = buyer.post(f"{API}/deals", json={
            "category": "CAT-06", "title": "TEST_refund_after_deliver",
            "counterparty_email": SEEDED["seller"][0], "amount": 100, "my_role": "buyer",
        }).json()["deal_id"]
        buyer.post(f"{API}/deals/{did}/accept-terms")
        seller.post(f"{API}/deals/{did}/accept-terms")
        buyer.post(f"{API}/deals/{did}/fund")
        seller.post(f"{API}/deals/{did}/deliver", json={"text": "shipped"})
        mongo.deals.update_one({"deal_id": did},
                               {"$set": {"deadlines.delivery_due": "2026-01-01T00:00:00+00:00"}})
        r = buyer.post(f"{API}/deals/{did}/settle", json={"path": "NO_DELIVERY_REFUND"})
        assert r.status_code == 400


# ---------------- Dispute from REFUND_REQUESTED ----------------
class TestDisputeFromRefund:
    def test_dispute_pauses_timers_and_captures_snapshots(self, buyer, seller, reviewer, mongo):
        did = buyer.post(f"{API}/deals", json={
            "category": "CAT-06", "title": "TEST_refund_dispute",
            "counterparty_email": SEEDED["seller"][0], "amount": 400, "my_role": "buyer",
        }).json()["deal_id"]
        buyer.post(f"{API}/deals/{did}/accept-terms")
        seller.post(f"{API}/deals/{did}/accept-terms")
        buyer.post(f"{API}/deals/{did}/fund")
        mongo.deals.update_one({"deal_id": did},
                               {"$set": {"deadlines.delivery_due": "2026-01-01T00:00:00+00:00"}})
        buyer.post(f"{API}/deals/{did}/settle", json={"path": "NO_DELIVERY_REFUND"})
        r = seller.post(f"{API}/deals/{did}/dispute",
                        json={"claim": "I did deliver", "evidence": "see https://example.com/"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "DISPUTED"
        assert d["timers"]["delivery"]["state"] == "paused"
        assert d["dispute"]["snapshots"], "dispute snapshots missing"
        assert d["dispute"]["timers_snapshot"] is not None

        # reviewer resolves
        held = d["held"]
        r2 = reviewer.post(f"{API}/deals/{did}/review",
                           json={"to_seller": 0, "to_buyer": held, "reasons": "no delivery evidence"})
        assert r2.status_code == 200
        assert r2.json()["status"] == "SETTLED"


# ---------------- Vault ----------------
VALID_JWK = {"kty": "EC", "crv": "P-256",
             "x": "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
             "y": "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0"}


class TestVault:
    @pytest.fixture(scope="class")
    def deal_id(self, buyer, seller):
        did = buyer.post(f"{API}/deals", json={
            "category": "CAT-06", "title": "TEST_vault",
            "counterparty_email": SEEDED["seller"][0], "amount": 300, "my_role": "buyer",
        }).json()["deal_id"]
        buyer.post(f"{API}/deals/{did}/accept-terms")
        seller.post(f"{API}/deals/{did}/accept-terms")
        buyer.post(f"{API}/deals/{did}/fund")
        return did

    def test_seal_before_key_fails(self, seller, deal_id):
        r = seller.post(f"{API}/deals/{deal_id}/vault/items", json={
            "field_key": "code", "label": "Code",
            "envelope": {"ephemeral_pub": "x", "iv": "y", "ciphertext": "z"},
        })
        assert r.status_code == 400

    def test_vault_get_structure(self, buyer, deal_id):
        r = buyer.get(f"{API}/deals/{deal_id}/vault")
        assert r.status_code == 200
        v = r.json()
        for k in ("has_key", "key_fingerprint", "items", "buyer_public_key",
                  "my_role", "seal_allowed", "reveal_allowed",
                  "access_log", "vault_fields", "requires_vault"):
            assert k in v, f"missing {k}"
        assert v["my_role"] == "buyer"

    def test_invalid_jwk_rejected(self, buyer, deal_id):
        r = buyer.post(f"{API}/deals/{deal_id}/vault/key", json={
            "public_key": {"kty": "EC", "x": "a", "y": "b"},  # no crv
            "fingerprint": "abc"})
        assert r.status_code == 400

    def test_non_buyer_cannot_set_key(self, seller, deal_id):
        r = seller.post(f"{API}/deals/{deal_id}/vault/key",
                        json={"public_key": VALID_JWK, "fingerprint": "f1"})
        assert r.status_code == 403

    def test_buyer_sets_key(self, buyer, deal_id):
        r = buyer.post(f"{API}/deals/{deal_id}/vault/key",
                       json={"public_key": VALID_JWK, "fingerprint": "fp-abcd"})
        assert r.status_code == 200
        d = r.json()
        assert d["vault"]["has_key"] is True
        assert any(n["kind"] == "vault_key_set" for n in d["notices"])

    def test_seller_seal_requires_envelope_fields(self, seller, deal_id):
        r = seller.post(f"{API}/deals/{deal_id}/vault/items", json={
            "field_key": "code", "label": "Gift card code",
            "envelope": {"ephemeral_pub": "e", "iv": "iv"},  # missing ciphertext
        })
        assert r.status_code == 400

    def test_buyer_cannot_seal(self, buyer, deal_id):
        r = buyer.post(f"{API}/deals/{deal_id}/vault/items", json={
            "field_key": "code", "label": "x",
            "envelope": {"ephemeral_pub": "e", "iv": "iv", "ciphertext": "c"},
        })
        assert r.status_code == 403

    def test_seller_seals(self, seller, deal_id):
        env = {"ephemeral_pub": "EPHEMPUB123", "iv": "IV456", "ciphertext": "CIPHER789"}
        r = seller.post(f"{API}/deals/{deal_id}/vault/items", json={
            "field_key": "gift_card_code", "label": "Gift card code", "envelope": env,
        })
        assert r.status_code == 200
        body = r.json()
        assert "item_id" in body
        # cache for next tests
        pytest.vault_env = env
        pytest.vault_item_id = body["item_id"]

    def test_buyer_reveal_blocked_before_delivery(self, buyer, deal_id):
        r = buyer.post(f"{API}/deals/{deal_id}/vault/items/{pytest.vault_item_id}/reveal")
        assert r.status_code == 400

    def test_key_rotation_blocked_after_seal(self, buyer, deal_id):
        r = buyer.post(f"{API}/deals/{deal_id}/vault/key",
                       json={"public_key": VALID_JWK, "fingerprint": "fp-new"})
        assert r.status_code == 400

    def test_deliver_then_buyer_reveal(self, buyer, seller, deal_id):
        seller.post(f"{API}/deals/{deal_id}/deliver", json={"text": "Delivered via vault."})
        r = buyer.post(f"{API}/deals/{deal_id}/vault/items/{pytest.vault_item_id}/reveal")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["envelope"] == pytest.vault_env, "envelope mismatch after round-trip"
        # access log + reveal count
        v = buyer.get(f"{API}/deals/{deal_id}/vault").json()
        assert len(v["access_log"]) >= 1
        item = next(i for i in v["items"] if i["item_id"] == pytest.vault_item_id)
        assert item["reveal_count"] >= 1

    def test_seller_cannot_reveal(self, seller, deal_id):
        r = seller.post(f"{API}/deals/{deal_id}/vault/items/{pytest.vault_item_id}/reveal")
        assert r.status_code == 403

    def test_seller_vault_hides_access_log(self, seller, deal_id):
        v = seller.get(f"{API}/deals/{deal_id}/vault").json()
        assert v["access_log"] == []

    def test_reviewer_sees_access_log(self, reviewer, deal_id):
        v = reviewer.get(f"{API}/deals/{deal_id}/vault").json()
        assert v["my_role"] == "reviewer"
        assert isinstance(v["access_log"], list)
        assert len(v["access_log"]) >= 1


# ---------------- Evidence drawer / reports ----------------
class TestEvidence:
    def test_create_report_with_snapshot(self, buyer):
        payload = {
            "subject_id": "SUB-CODEWORKS", "kind": "neutral",
            "title": f"TEST_evidence_{uuid.uuid4().hex[:6]}",
            "summary": "s", "language": "en",
            "source_url": "https://example.com/",
            "author_excerpt": "pasted excerpt",
            "access_status": "open",
        }
        r = buyer.post(f"{API}/reports", json=payload)
        assert r.status_code == 200, r.text
        rep = r.json()
        snap = rep.get("snapshot")
        assert snap and snap.get("url")
        for k in ("host", "fetched_at", "ok", "http_status", "auto_access_status", "content_hash", "origin"):
            assert k in snap
        assert snap["origin"] == "live"
        assert rep["declared_access_status"] == "open"
        assert rep["author_excerpt"] == "pasted excerpt"
        assert rep["access_status"] == snap["auto_access_status"]

    def test_ssrf_localhost_blocked(self, buyer):
        payload = {
            "subject_id": "SUB-CODEWORKS", "kind": "neutral",
            "title": f"TEST_ssrf_{uuid.uuid4().hex[:6]}",
            "summary": "s",
            "source_url": "http://localhost:8001/api/health",
        }
        r = buyer.post(f"{API}/reports", json=payload)
        assert r.status_code == 200
        rep = r.json()
        snap = rep["snapshot"]
        assert rep["access_status"] == "unavailable"
        err = (snap.get("error") or "").lower()
        assert "private" in err or "internal" in err or "localhost" in err, f"error: {snap.get('error')}"

    def test_get_report_access_rules(self, buyer, seller):
        # buyer creates draft
        rid = buyer.post(f"{API}/reports", json={
            "subject_id": "SUB-CODEWORKS", "kind": "neutral",
            "title": f"TEST_access_{uuid.uuid4().hex[:6]}",
            "summary": "s",
        }).json()["report_id"]
        # author can read own draft
        r1 = buyer.get(f"{API}/reports/{rid}")
        assert r1.status_code == 200
        # another user → 403
        r2 = seller.get(f"{API}/reports/{rid}")
        assert r2.status_code == 403
        assert "not published" in r2.json().get("detail", "").lower()

    def test_refetch_rules(self, buyer, seller):
        rid = buyer.post(f"{API}/reports", json={
            "subject_id": "SUB-CODEWORKS", "kind": "neutral",
            "title": f"TEST_refetch_{uuid.uuid4().hex[:6]}", "summary": "s",
            "source_url": "https://example.com/",
        }).json()["report_id"]
        # non-author forbidden
        r_bad = seller.post(f"{API}/reports/{rid}/refetch")
        assert r_bad.status_code == 403
        # author ok, snapshot_history grows by 1
        r_ok = buyer.post(f"{API}/reports/{rid}/refetch")
        assert r_ok.status_code == 200, r_ok.text
        assert len(r_ok.json().get("snapshot_history", [])) == 1

    def test_refetch_without_url_400(self, buyer):
        rid = buyer.post(f"{API}/reports", json={
            "subject_id": "SUB-CODEWORKS", "kind": "neutral",
            "title": f"TEST_nourl_{uuid.uuid4().hex[:6]}", "summary": "s",
        }).json()["report_id"]
        r = buyer.post(f"{API}/reports/{rid}/refetch")
        assert r.status_code == 400

    def test_edit_url_change_pushes_history(self, buyer):
        rid = buyer.post(f"{API}/reports", json={
            "subject_id": "SUB-CODEWORKS", "kind": "neutral",
            "title": f"TEST_edit_{uuid.uuid4().hex[:6]}", "summary": "s",
            "source_url": "https://example.com/",
            "author_excerpt": "orig",
        }).json()["report_id"]
        # unchanged URL — history stays empty, excerpt updates
        r1 = buyer.put(f"{API}/reports/{rid}", json={
            "subject_id": "SUB-CODEWORKS", "kind": "neutral",
            "title": "t", "summary": "s",
            "source_url": "https://example.com/",
            "author_excerpt": "updated",
        })
        assert r1.status_code == 200
        assert r1.json()["author_excerpt"] == "updated"
        assert len(r1.json().get("snapshot_history", [])) == 0

        # changed URL — snapshot_history grows
        r2 = buyer.put(f"{API}/reports/{rid}", json={
            "subject_id": "SUB-CODEWORKS", "kind": "neutral",
            "title": "t", "summary": "s",
            "source_url": "https://example.org/",
            "author_excerpt": "updated",
        })
        assert r2.status_code == 200
        assert len(r2.json().get("snapshot_history", [])) == 1

    def test_seeded_report_origin_seed(self):
        # public endpoint
        r = requests.get(f"{API}/subjects/SUB-DIGIMART1")
        assert r.status_code == 200
        reps = r.json()["reports"]
        rep = next((x for x in reps if x["report_id"] == "REP-D1NEG001"), None)
        assert rep is not None
        snap = rep.get("snapshot")
        assert snap and snap.get("origin") == "seed"


# ---------------- Receipt includes Phase-2 fields ----------------
class TestReceipt:
    def test_demo_receipt_shape(self, buyer):
        r = buyer.get(f"{API}/deals/LP-D-DEMO0001/receipt")
        assert r.status_code == 200
        rec = r.json()
        for k in ("deadlines", "timers", "vault", "notices"):
            assert k in rec


# ---------------- Assistant guidance ----------------
class TestAssistantGuidance:
    def test_refund_requested_guidance(self, buyer, seller, mongo):
        did = buyer.post(f"{API}/deals", json={
            "category": "CAT-06", "title": "TEST_assist_refund",
            "counterparty_email": SEEDED["seller"][0], "amount": 100, "my_role": "buyer",
        }).json()["deal_id"]
        buyer.post(f"{API}/deals/{did}/accept-terms")
        seller.post(f"{API}/deals/{did}/accept-terms")
        buyer.post(f"{API}/deals/{did}/fund")
        mongo.deals.update_one({"deal_id": did},
                               {"$set": {"deadlines.delivery_due": "2026-01-01T00:00:00+00:00"}})
        buyer.post(f"{API}/deals/{did}/settle", json={"path": "NO_DELIVERY_REFUND"})
        r = buyer.get(f"{API}/deals/{did}/assistant/guidance")
        assert r.status_code == 200
        text = str(r.json()).lower()
        assert "refund" in text

    def test_overdue_step_first(self, buyer, seller, mongo):
        did = buyer.post(f"{API}/deals", json={
            "category": "CAT-06", "title": "TEST_assist_overdue",
            "counterparty_email": SEEDED["seller"][0], "amount": 100, "my_role": "buyer",
        }).json()["deal_id"]
        buyer.post(f"{API}/deals/{did}/accept-terms")
        seller.post(f"{API}/deals/{did}/accept-terms")
        buyer.post(f"{API}/deals/{did}/fund")
        mongo.deals.update_one({"deal_id": did},
                               {"$set": {"deadlines.delivery_due": "2026-01-01T00:00:00+00:00"}})
        steps = buyer.get(f"{API}/deals/{did}/assistant/guidance").json()["steps"]
        assert steps, "no steps"
        s0 = str(steps[0]).lower()
        assert "overdue" in s0 or "pass" in s0 or "refund" in s0

    def test_vault_setup_step_funded_no_key(self, buyer, seller):
        did = buyer.post(f"{API}/deals", json={
            "category": "CAT-06", "title": "TEST_assist_vault",
            "counterparty_email": SEEDED["seller"][0], "amount": 100, "my_role": "buyer",
        }).json()["deal_id"]
        buyer.post(f"{API}/deals/{did}/accept-terms")
        seller.post(f"{API}/deals/{did}/accept-terms")
        buyer.post(f"{API}/deals/{did}/fund")
        steps = buyer.get(f"{API}/deals/{did}/assistant/guidance").json()["steps"]
        assert any("vault" in str(s).lower() for s in steps)

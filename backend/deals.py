import os
import json
import uuid
from datetime import datetime, timezone, timedelta

from cryptography.fernet import Fernet
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional

from db import db
from auth import get_current_user, require_roles
import policy
import assistant
import evidence

deals_router = APIRouter(prefix="/api", tags=["deals"])
_fernet = Fernet(os.environ["VAULT_KEY"].encode())


def _now_dt():
    return datetime.now(timezone.utc)


def _now():
    return _now_dt().isoformat()


# ---------- schemas ----------
class DealCreate(BaseModel):
    category: str
    title: str
    description: str = ""
    service_mode: str = "ai_first"
    my_role: str = "buyer"               # buyer | seller
    counterparty_email: str
    amount: int = Field(ge=1)
    deadline_days: int = Field(default=7, ge=1, le=90)
    inspection_days: int = Field(default=3, ge=1, le=60)
    terms: List[str] = []


class MessageIn(BaseModel):
    text: str


class InspectIn(BaseModel):
    item_id: str
    status: str                          # PASS | FAIL | UNKNOWN
    note: str = ""


class SettleIn(BaseModel):
    path: str                            # ACCEPTED_RELEASE | MUTUAL_RESOLUTION | NO_DELIVERY_REFUND
    to_seller: int = 0
    to_buyer: int = 0


class DisputeIn(BaseModel):
    claim: str
    evidence: str = ""


class ReviewIn(BaseModel):
    to_seller: int = 0
    to_buyer: int = 0
    reasons: str = ""
    unresolved: bool = False


class ExtensionIn(BaseModel):
    window: str                          # delivery | inspection
    extra_days: int = Field(ge=1, le=60)
    reason: str = ""


class VaultKeyIn(BaseModel):
    public_key: dict
    fingerprint: str


class VaultItemIn(BaseModel):
    field_key: str
    label: str
    envelope: dict                       # {alg, ephemeral_pub, iv, ciphertext} — E2E ciphertext


# ---------- helpers ----------
def _notice(kind, title_en, title_bn, body_en="", body_bn=""):
    return {"notice_id": uuid.uuid4().hex[:8], "kind": kind, "at": _now(),
            "title_en": title_en, "title_bn": title_bn, "body_en": body_en, "body_bn": body_bn}


def _empty_vault():
    return {"buyer_public_key": None, "key_fingerprint": None, "key_set_at": None, "items": [], "access_log": []}


def _vault_summary(deal):
    v = deal.get("vault") or _empty_vault()
    log = v.get("access_log", [])
    return {"has_key": bool(v.get("buyer_public_key")), "key_fingerprint": v.get("key_fingerprint"),
            "key_set_at": v.get("key_set_at"),
            "items": [{"item_id": i["item_id"], "field_key": i["field_key"], "label": i["label"],
                       "sealed_at": i["sealed_at"],
                       "reveal_count": sum(1 for a in log if a["item_id"] == i["item_id"])} for i in v.get("items", [])]}


def _public(deal: dict) -> dict:
    deal.pop("_id", None)
    deal["held"] = policy.held_amount(deal.get("ledger", []))
    deal["completion_summary"] = policy.completion_summary(deal.get("completion_items", []))
    deal["timers"] = policy.compute_timers(deal)
    deal["vault"] = _vault_summary(deal)
    deal["can_request_refund"] = policy.can_request_no_delivery_refund(deal)
    deal.setdefault("notices", [])
    deal.setdefault("deadlines", {})
    return deal


async def _fetch(deal_id):
    return await db.deals.find_one({"deal_id": deal_id}, {"_id": 0})


async def _get_deal_for_user(deal_id: str, user: dict, allow_reviewer: bool = False) -> dict:
    deal = await _fetch(deal_id)
    if not deal:
        raise HTTPException(404, "Deal not found")
    uid, email = user["user_id"], user["email"]
    is_party = uid in (deal.get("buyer_id"), deal.get("seller_id"))
    is_invited = email in (deal.get("buyer_email"), deal.get("seller_email"))
    is_reviewer = user.get("role") in ("reviewer", "admin")
    if not (is_party or is_invited or (allow_reviewer and is_reviewer)):
        raise HTTPException(403, "You do not have access to this deal")
    return deal


def _role_in_deal(deal, user):
    if user["user_id"] == deal.get("buyer_id") or user["email"] == deal.get("buyer_email"):
        return "buyer"
    if user["user_id"] == deal.get("seller_id") or user["email"] == deal.get("seller_email"):
        return "seller"
    return None


async def _sync_overdue(deal):
    """Append an overdue notice exactly once per window so a passed deadline is never silent."""
    timers = policy.compute_timers(deal)
    dl = deal.get("deadlines") or {}
    push, sets = [], {}
    if timers["delivery"]["state"] == "overdue" and not dl.get("delivery_overdue_noticed"):
        push.append(_notice("window_overdue", "Delivery deadline passed", "সরবরাহের সময়সীমা পেরিয়েছে",
                            "Nothing was delivered by the due time. The buyer may request a no-delivery refund, or both parties may agree an extension.",
                            "নির্ধারিত সময়ে কিছু সরবরাহ হয়নি। ক্রেতা নো-ডেলিভারি রিফান্ড চাইতে পারেন, বা উভয় পক্ষ মেয়াদ বাড়াতে সম্মত হতে পারেন।"))
        sets["deadlines.delivery_overdue_noticed"] = True
    if timers["inspection"]["state"] == "overdue" and not dl.get("inspection_overdue_noticed"):
        push.append(_notice("window_overdue", "Inspection window closed", "পরিদর্শনের সময় শেষ",
                            "The buyer has not settled within the inspection window. Nothing moves automatically; either party may request an extension or send the case to review.",
                            "ক্রেতা পরিদর্শন সময়ে নিষ্পত্তি করেননি। কিছুই স্বয়ংক্রিয়ভাবে সরে না; যেকোনো পক্ষ মেয়াদ বাড়াতে বা পর্যালোচনায় পাঠাতে পারে।"))
        sets["deadlines.inspection_overdue_noticed"] = True
    if push:
        await db.deals.update_one({"deal_id": deal["deal_id"]}, {"$push": {"notices": {"$each": push}}, "$set": sets})
        deal["notices"] = deal.get("notices", []) + push
        deal.setdefault("deadlines", {}).update({k.split(".")[1]: v for k, v in sets.items()})
    return deal


# ---------- meta ----------
@deals_router.get("/categories")
async def categories():
    return [policy.category_public(c) for c in policy.CATEGORIES]


@deals_router.get("/service-modes")
async def service_modes():
    human_count = await db.users.count_documents({"role": {"$in": ["reviewer", "admin"]}})
    return [{**m, "human_available": True if m["code"] == "ai_only" else human_count > 0} for m in policy.SERVICE_MODES]


# ---------- deal lifecycle ----------
@deals_router.post("/deals")
async def create_deal(body: DealCreate, user: dict = Depends(get_current_user)):
    if body.category not in policy.CATEGORIES:
        raise HTTPException(400, "Unknown category")
    if body.my_role not in ("buyer", "seller"):
        raise HTTPException(400, "my_role must be buyer or seller")
    cp = body.counterparty_email.lower()
    me_email = user["email"]
    if cp == me_email:
        raise HTTPException(400, "Counterparty must be a different email")
    cp_user = await db.users.find_one({"email": cp}, {"_id": 0})

    deal_id = f"LP-D-{uuid.uuid4().hex[:8].upper()}"
    if body.my_role == "buyer":
        buyer_id, buyer_email = user["user_id"], me_email
        seller_id, seller_email = (cp_user["user_id"] if cp_user else None), cp
    else:
        seller_id, seller_email = user["user_id"], me_email
        buyer_id, buyer_email = (cp_user["user_id"] if cp_user else None), cp

    items = policy.build_completion_items(body.category)
    deal = {
        "deal_id": deal_id,
        "category": body.category,
        "title": body.title,
        "description": body.description,
        "service_mode": body.service_mode,
        "buyer_id": buyer_id, "buyer_email": buyer_email,
        "seller_id": seller_id, "seller_email": seller_email,
        "created_by": user["user_id"],
        "status": "INVITED",
        "terms": {
            "amount": body.amount,
            "currency": "BDT",
            "deadline_days": body.deadline_days,
            "inspection_days": body.inspection_days,
            "items": body.terms or [i["label_en"] for i in items],
            "version": 1,
        },
        "terms_version": 1,
        "buyer_accepted_version": None,
        "seller_accepted_version": None,
        "monitoring_consent": {"buyer": False, "seller": False},
        "completion_items": items,
        "messages": [],
        "ledger": [],
        "delivery": None,
        "dispute": None,
        "settlement": None,
        "settlement_proposal": None,
        "deadlines": {"delivery_due": None, "inspection_due": None, "extensions": [], "extension_request": None},
        "notices": [_notice("created", "Deal created", "ডিল তৈরি হয়েছে",
                            f"Delivery window: {body.deadline_days} days after funding. Inspection window: {body.inspection_days} days after delivery.",
                            f"সরবরাহ সময়: ফান্ডিংয়ের পর {body.deadline_days} দিন। পরিদর্শন সময়: সরবরাহের পর {body.inspection_days} দিন।")],
        "vault": _empty_vault(),
        "created_at": _now(), "updated_at": _now(),
    }
    await db.deals.insert_one(dict(deal))
    return _public(dict(deal))


@deals_router.get("/deals")
async def list_deals(user: dict = Depends(get_current_user)):
    q = {"$or": [
        {"buyer_id": user["user_id"]}, {"seller_id": user["user_id"]},
        {"buyer_email": user["email"]}, {"seller_email": user["email"]},
    ]}
    docs = await db.deals.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [_public(d) for d in docs]


@deals_router.get("/deals/{deal_id}")
async def get_deal(deal_id: str, user: dict = Depends(get_current_user)):
    deal = await _get_deal_for_user(deal_id, user, allow_reviewer=True)
    return _public(await _sync_overdue(deal))


@deals_router.post("/deals/{deal_id}/accept-terms")
async def accept_terms(deal_id: str, user: dict = Depends(get_current_user)):
    deal = await _get_deal_for_user(deal_id, user)
    role = _role_in_deal(deal, user)
    if not role:
        raise HTTPException(403, "Not a party to this deal")
    updates = {"updated_at": _now()}
    if role == "buyer" and not deal.get("buyer_id"):
        updates["buyer_id"] = user["user_id"]
    if role == "seller" and not deal.get("seller_id"):
        updates["seller_id"] = user["user_id"]
    updates[f"{role}_accepted_version"] = deal["terms_version"]

    bav = deal["terms_version"] if role == "buyer" else deal.get("buyer_accepted_version")
    sav = deal["terms_version"] if role == "seller" else deal.get("seller_accepted_version")
    if bav == deal["terms_version"] and sav == deal["terms_version"]:
        updates["status"] = "TERMS_ACCEPTED"
    await db.deals.update_one({"deal_id": deal_id}, {"$set": updates})
    return _public(await _fetch(deal_id))


@deals_router.post("/deals/{deal_id}/consent-monitoring")
async def consent_monitoring(deal_id: str, user: dict = Depends(get_current_user)):
    deal = await _get_deal_for_user(deal_id, user)
    role = _role_in_deal(deal, user)
    if not role:
        raise HTTPException(403, "Not a party")
    await db.deals.update_one({"deal_id": deal_id}, {"$set": {f"monitoring_consent.{role}": True, "updated_at": _now()}})
    return _public(await _fetch(deal_id))


@deals_router.post("/deals/{deal_id}/fund")
async def fund(deal_id: str, user: dict = Depends(get_current_user)):
    deal = await _get_deal_for_user(deal_id, user)
    if _role_in_deal(deal, user) != "buyer":
        raise HTTPException(403, "Only the buyer can fund")
    if deal["status"] != "TERMS_ACCEPTED":
        raise HTTPException(400, "Both parties must accept terms before funding")
    days = deal["terms"]["deadline_days"]
    due = (_now_dt() + timedelta(days=days)).isoformat()
    entry = {"type": "FUND", "amount": deal["terms"]["amount"], "from": "buyer", "to": "hold",
             "at": _now(), "by": user["user_id"], "note": "Mock funding (simulated)"}
    notice = _notice("window_started", "Delivery window started", "সরবরাহ সময় শুরু",
                     f"The seller must deliver within {days} days (due {due[:16].replace('T', ' ')} UTC). This window can only be extended by mutual consent — never shortened.",
                     f"বিক্রেতাকে {days} দিনের মধ্যে সরবরাহ করতে হবে। এই সময় শুধু পারস্পরিক সম্মতিতে বাড়ানো যায় — কখনো কমানো যায় না।")
    await db.deals.update_one({"deal_id": deal_id}, {
        "$push": {"ledger": entry, "notices": notice},
        "$set": {"status": "FUNDED", "deadlines.delivery_due": due, "updated_at": _now()}})
    return _public(await _fetch(deal_id))


@deals_router.post("/deals/{deal_id}/deliver")
async def deliver(deal_id: str, body: MessageIn, user: dict = Depends(get_current_user)):
    deal = await _get_deal_for_user(deal_id, user)
    if _role_in_deal(deal, user) != "seller":
        raise HTTPException(403, "Only the seller can deliver")
    if deal["status"] != "FUNDED":
        raise HTTPException(400, "Deal must be funded (and no refund requested) before delivery")
    days = deal["terms"].get("inspection_days", 3)
    due = (_now_dt() + timedelta(days=days)).isoformat()
    snaps = await evidence.snapshot_many(body.text)
    delivery = {"note": body.text, "at": _now(), "by": user["user_id"], "snapshots": snaps,
                "late": policy.compute_timers(deal)["delivery"]["overdue"]}
    notice = _notice("window_started", "Inspection window started", "পরিদর্শন সময় শুরু",
                     f"The buyer has {days} days to inspect and settle (due {due[:16].replace('T', ' ')} UTC). Nothing moves automatically when it closes.",
                     f"ক্রেতার পরিদর্শন ও নিষ্পত্তির জন্য {days} দিন আছে। শেষ হলে কিছুই স্বয়ংক্রিয়ভাবে সরে না।")
    await db.deals.update_one({"deal_id": deal_id}, {
        "$push": {"notices": notice},
        "$set": {"delivery": delivery, "status": "DELIVERED", "deadlines.inspection_due": due, "updated_at": _now()}})
    return _public(await _fetch(deal_id))


# ---------- deadlines: extensions by mutual consent ----------
@deals_router.post("/deals/{deal_id}/extensions")
async def request_extension(deal_id: str, body: ExtensionIn, user: dict = Depends(get_current_user)):
    deal = await _get_deal_for_user(deal_id, user)
    role = _role_in_deal(deal, user)
    if not role:
        raise HTTPException(403, "Not a party")
    if body.window not in ("delivery", "inspection"):
        raise HTTPException(400, "window must be delivery or inspection")
    if deal["status"] in policy.TERMINAL_STATUSES + ("DISPUTED",):
        raise HTTPException(400, f"Cannot extend from status {deal['status']}")
    timers = policy.compute_timers(deal)
    if timers[body.window]["state"] in ("not_started", "closed"):
        raise HTTPException(400, f"The {body.window} window is not open")
    if (deal.get("deadlines") or {}).get("extension_request"):
        raise HTTPException(400, "An extension request is already pending")
    req = {"request_id": uuid.uuid4().hex[:8], "window": body.window, "extra_days": body.extra_days,
           "reason": body.reason, "by_role": role, "by": user["user_id"], "at": _now()}
    notice = _notice("extension_requested", f"Extension requested ({body.window})", f"মেয়াদ বৃদ্ধির অনুরোধ ({body.window})",
                     f"The {role} asks for +{body.extra_days} day(s). {body.reason}".strip(),
                     f"{role} +{body.extra_days} দিন চেয়েছেন। {body.reason}".strip())
    await db.deals.update_one({"deal_id": deal_id}, {
        "$push": {"notices": notice}, "$set": {"deadlines.extension_request": req, "updated_at": _now()}})
    return _public(await _fetch(deal_id))


@deals_router.post("/deals/{deal_id}/extensions/{action}")
async def answer_extension(deal_id: str, action: str, user: dict = Depends(get_current_user)):
    deal = await _get_deal_for_user(deal_id, user)
    role = _role_in_deal(deal, user)
    if not role:
        raise HTTPException(403, "Not a party")
    req = (deal.get("deadlines") or {}).get("extension_request")
    if not req:
        raise HTTPException(404, "No pending extension request")
    if req["by_role"] == role:
        raise HTTPException(403, "Only the other party can answer this request")
    if action not in ("approve", "decline"):
        raise HTTPException(400, "action must be approve or decline")
    sets = {"deadlines.extension_request": None, "updated_at": _now()}
    if action == "approve":
        key = f"{req['window']}_due"
        old = deal["deadlines"][key]
        new = (datetime.fromisoformat(old) + timedelta(days=req["extra_days"])).isoformat()
        sets[f"deadlines.{key}"] = new
        sets[f"deadlines.{req['window']}_overdue_noticed"] = False
        ext = {**req, "approved_by": user["user_id"], "approved_at": _now(), "old_due": old, "new_due": new}
        notice = _notice("extension_approved", f"Extension approved ({req['window']})", f"মেয়াদ বৃদ্ধি অনুমোদিত ({req['window']})",
                         f"Both parties agreed +{req['extra_days']} day(s). New due: {new[:16].replace('T', ' ')} UTC.",
                         f"উভয় পক্ষ +{req['extra_days']} দিনে সম্মত। নতুন সময়সীমা: {new[:16].replace('T', ' ')} UTC।")
        await db.deals.update_one({"deal_id": deal_id}, {"$push": {"notices": notice, "deadlines.extensions": ext}, "$set": sets})
    else:
        notice = _notice("extension_declined", f"Extension declined ({req['window']})", f"মেয়াদ বৃদ্ধি প্রত্যাখ্যাত ({req['window']})",
                         "The original deadline stands.", "মূল সময়সীমা বহাল।")
        await db.deals.update_one({"deal_id": deal_id}, {"$push": {"notices": notice}, "$set": sets})
    return _public(await _fetch(deal_id))


# ---------- deal room messages (with version history) ----------
@deals_router.post("/deals/{deal_id}/messages")
async def send_message(deal_id: str, body: MessageIn, user: dict = Depends(get_current_user)):
    deal = await _get_deal_for_user(deal_id, user)
    if not _role_in_deal(deal, user):
        raise HTTPException(403, "Not a party")
    msg = {
        "msg_id": uuid.uuid4().hex[:10],
        "sender_id": user["user_id"], "sender_name": user["name"],
        "current_text": body.text,
        "versions": [{"text": body.text, "at": _now()}],
        "created_at": _now(), "ai_monitored": True,
    }
    await db.deals.update_one({"deal_id": deal_id}, {"$push": {"messages": msg}, "$set": {"updated_at": _now()}})
    return msg


@deals_router.put("/deals/{deal_id}/messages/{msg_id}")
async def edit_message(deal_id: str, msg_id: str, body: MessageIn, user: dict = Depends(get_current_user)):
    deal = await _get_deal_for_user(deal_id, user)
    msg = next((m for m in deal.get("messages", []) if m["msg_id"] == msg_id), None)
    if not msg:
        raise HTTPException(404, "Message not found")
    if msg["sender_id"] != user["user_id"]:
        raise HTTPException(403, "Can only edit your own message")
    msg["versions"].append({"text": body.text, "at": _now()})
    msg["current_text"] = body.text
    await db.deals.update_one({"deal_id": deal_id, "messages.msg_id": msg_id},
                              {"$set": {"messages.$": msg, "updated_at": _now()}})
    return msg


# ---------- inspection ----------
@deals_router.post("/deals/{deal_id}/inspect")
async def inspect(deal_id: str, body: InspectIn, user: dict = Depends(get_current_user)):
    if body.status not in ("PASS", "FAIL", "UNKNOWN"):
        raise HTTPException(400, "status must be PASS, FAIL or UNKNOWN")
    deal = await _get_deal_for_user(deal_id, user)
    if _role_in_deal(deal, user) != "buyer":
        raise HTTPException(403, "Only the buyer inspects the completion map")
    if deal["status"] not in ("DELIVERED", "INSPECTING"):
        raise HTTPException(400, "Items can be inspected only after delivery")
    items = deal["completion_items"]
    found = False
    for it in items:
        if it["id"] == body.item_id:
            it.update({"status": body.status, "note": body.note,
                       "updated_by": user["user_id"], "updated_at": _now()})
            found = True
    if not found:
        raise HTTPException(404, "Checklist item not found")
    await db.deals.update_one({"deal_id": deal_id},
                              {"$set": {"completion_items": items, "status": "INSPECTING", "updated_at": _now()}})
    return _public(await _fetch(deal_id))


# ---------- settlement (the four authorization paths) ----------
@deals_router.post("/deals/{deal_id}/settle")
async def settle(deal_id: str, body: SettleIn, user: dict = Depends(get_current_user)):
    deal = await _get_deal_for_user(deal_id, user)
    role = _role_in_deal(deal, user)
    if not role:
        raise HTTPException(403, "Not a party")
    if deal["status"] in ("SETTLED", "UNRESOLVED", "DISPUTED"):
        raise HTTPException(400, f"Cannot settle from status {deal['status']}")
    held = policy.held_amount(deal.get("ledger", []))
    if held <= 0:
        raise HTTPException(400, "No held funds to settle")
    prop = deal.get("settlement_proposal")
    prop_path = (prop or {}).get("path", "MUTUAL_RESOLUTION")

    if body.path == "ACCEPTED_RELEASE":
        if role != "buyer":
            raise HTTPException(403, "Only the buyer can release funds to the seller")
        return await _finalize(deal, "ACCEPTED_RELEASE", held, 0, "Buyer accepted and released.", user)

    if body.path == "MUTUAL_RESOLUTION":
        if body.to_seller + body.to_buyer != held:
            raise HTTPException(400, f"Split must sum to the held amount ৳{held}")
        if prop and prop_path == "MUTUAL_RESOLUTION" and prop["to_seller"] == body.to_seller \
                and prop["to_buyer"] == body.to_buyer and prop["by_role"] != role:
            return await _finalize(deal, "MUTUAL_RESOLUTION", body.to_seller, body.to_buyer,
                                   "Both parties agreed the split.", user)
        await db.deals.update_one({"deal_id": deal_id}, {"$set": {
            "settlement_proposal": {"path": "MUTUAL_RESOLUTION", "to_seller": body.to_seller, "to_buyer": body.to_buyer,
                                    "by_role": role, "at": _now()},
            "status": "SETTLE_PROPOSED", "updated_at": _now()}})
        return _public(await _fetch(deal_id))

    if body.path == "NO_DELIVERY_REFUND":
        if deal.get("delivery") is not None:
            raise HTTPException(400, "Something was delivered — use inspection, a split, or a dispute")
        if not policy.can_request_no_delivery_refund(deal):
            raise HTTPException(400, "The delivery deadline has not passed yet")
        if role == "buyer":
            if prop and prop_path == "NO_DELIVERY_REFUND":
                raise HTTPException(400, "Refund already requested — waiting for the seller to confirm")
            notice = _notice("refund_requested", "No-delivery refund requested", "নো-ডেলিভারি রিফান্ড অনুরোধ",
                             f"The buyer requests the full ৳{held} back because nothing was delivered by the deadline. The seller can confirm, or either party can send it to a reviewer.",
                             f"সময়সীমার মধ্যে কিছু সরবরাহ না হওয়ায় ক্রেতা পুরো ৳{held} ফেরত চেয়েছেন। বিক্রেতা নিশ্চিত করতে পারেন, বা যেকোনো পক্ষ পর্যালোচকের কাছে পাঠাতে পারে।")
            await db.deals.update_one({"deal_id": deal_id}, {
                "$push": {"notices": notice},
                "$set": {"settlement_proposal": {"path": "NO_DELIVERY_REFUND", "to_seller": 0, "to_buyer": held,
                                                 "by_role": "buyer", "at": _now()},
                         "status": "REFUND_REQUESTED", "updated_at": _now()}})
            return _public(await _fetch(deal_id))
        if not (prop and prop_path == "NO_DELIVERY_REFUND"):
            raise HTTPException(400, "The buyer has not requested a no-delivery refund")
        return await _finalize(deal, "NO_DELIVERY_REFUND", 0, held,
                               "Seller confirmed nothing was delivered after the deadline; full refund.", user)

    raise HTTPException(400, "Unsupported settlement path")


async def _finalize(deal, path, to_seller, to_buyer, reasons, user):
    ledger_add = []
    if to_seller > 0:
        ledger_add.append({"type": "RELEASE", "amount": to_seller, "from": "hold", "to": "seller",
                           "at": _now(), "by": user["user_id"], "note": reasons})
    if to_buyer > 0:
        ledger_add.append({"type": "REFUND", "amount": to_buyer, "from": "hold", "to": "buyer",
                           "at": _now(), "by": user["user_id"], "note": reasons})
    settlement = {"path": path, "to_seller": to_seller, "to_buyer": to_buyer,
                  "reasons": reasons, "terms_version": deal["terms_version"],
                  "at": _now(), "by": user["user_id"]}
    notice = _notice("settled", f"Settled via {path}", f"{path} পথে নিষ্পত্তি",
                     f"৳{to_seller} to seller, ৳{to_buyer} to buyer.", f"বিক্রেতাকে ৳{to_seller}, ক্রেতাকে ৳{to_buyer}।")
    await db.deals.update_one({"deal_id": deal["deal_id"]}, {
        "$push": {"ledger": {"$each": ledger_add}, "notices": notice},
        "$set": {"settlement": settlement, "status": "SETTLED", "settlement_proposal": None, "updated_at": _now()}})
    return _public(await _fetch(deal["deal_id"]))


# ---------- disputes ----------
@deals_router.post("/deals/{deal_id}/dispute")
async def open_dispute(deal_id: str, body: DisputeIn, user: dict = Depends(get_current_user)):
    deal = await _get_deal_for_user(deal_id, user)
    if not policy.can_open_dispute(deal, user["user_id"]):
        raise HTTPException(400, "A dispute cannot be opened at this stage")
    dispute = {
        "dispute_id": f"LP-X-{uuid.uuid4().hex[:6].upper()}",
        "opened_by": user["user_id"], "opened_role": _role_in_deal(deal, user),
        "claim": body.claim, "evidence": body.evidence,
        "snapshots": await evidence.snapshot_many(body.evidence),
        "held_snapshot": policy.held_amount(deal.get("ledger", [])),
        "timers_snapshot": policy.compute_timers(deal),
        "status": "OPEN", "at": _now(),
        "review": None,
    }
    notice = _notice("dispute_opened", "Dispute opened — timers paused", "বিরোধ খোলা — টাইমার স্থগিত",
                     "A human reviewer will decide. Deadlines do not run while the case is under review.",
                     "একজন মানব পর্যালোচক সিদ্ধান্ত নেবেন। পর্যালোচনা চলাকালে সময়সীমা চলে না।")
    await db.deals.update_one({"deal_id": deal_id}, {
        "$push": {"notices": notice},
        "$set": {"dispute": dispute, "status": "DISPUTED", "updated_at": _now()}})
    return _public(await _fetch(deal_id))


@deals_router.get("/disputes/queue")
async def dispute_queue(user: dict = Depends(require_roles("reviewer", "admin"))):
    docs = await db.deals.find({"status": "DISPUTED"}, {"_id": 0}).sort("updated_at", 1).to_list(200)
    return [_public(d) for d in docs]


@deals_router.post("/deals/{deal_id}/review")
async def review_dispute(deal_id: str, body: ReviewIn, user: dict = Depends(require_roles("reviewer", "admin"))):
    deal = await _fetch(deal_id)
    if not deal:
        raise HTTPException(404, "Deal not found")
    if deal["status"] != "DISPUTED":
        raise HTTPException(400, "Deal is not under dispute")
    if deal["dispute"]["opened_by"] == user["user_id"]:
        raise HTTPException(403, "A reviewer cannot review a dispute they opened")
    held = policy.held_amount(deal.get("ledger", []))
    if body.unresolved:
        review = {"outcome": "UNRESOLVED", "reasons": body.reasons, "by": user["user_id"], "at": _now()}
        await db.deals.update_one({"deal_id": deal_id},
                                  {"$set": {"dispute.review": review, "dispute.status": "UNRESOLVED",
                                            "status": "UNRESOLVED", "updated_at": _now()}})
        return _public(await _fetch(deal_id))
    if body.to_seller + body.to_buyer != held:
        raise HTTPException(400, f"Reviewed allocation must sum to the held amount ৳{held}")
    review = {"outcome": "RESOLVED", "to_seller": body.to_seller, "to_buyer": body.to_buyer,
              "reasons": body.reasons, "by": user["user_id"], "at": _now()}
    await db.deals.update_one({"deal_id": deal_id},
                              {"$set": {"dispute.review": review, "dispute.status": "RESOLVED"}})
    deal = await _fetch(deal_id)
    return await _finalize(deal, "REVIEWED_RESOLUTION", body.to_seller, body.to_buyer,
                           f"Reviewer decision: {body.reasons}", user)


# ---------- secret delivery vault (FE-15) ----------
# Layer 1: the browser encrypts to the buyer's device key (ECDH P-256 + AES-GCM); the server never sees plaintext.
# Layer 2: the ciphertext envelope is additionally encrypted at rest with VAULT_KEY (Fernet).
@deals_router.get("/deals/{deal_id}/vault")
async def vault_get(deal_id: str, user: dict = Depends(get_current_user)):
    deal = await _get_deal_for_user(deal_id, user, allow_reviewer=True)
    role = _role_in_deal(deal, user) or "reviewer"
    v = deal.get("vault") or _empty_vault()
    summary = _vault_summary(deal)
    return {**summary, "buyer_public_key": v.get("buyer_public_key"), "my_role": role,
            "seal_allowed": role == "seller" and deal["status"] in policy.VAULT_SEAL_STATUSES and bool(v.get("buyer_public_key")),
            "reveal_allowed": role == "buyer" and deal["status"] in policy.VAULT_REVEAL_STATUSES,
            "access_log": v.get("access_log", []) if role != "seller" else [],
            "vault_fields": policy.category_public(deal["category"])["vault_fields"],
            "requires_vault": policy.CATEGORIES[deal["category"]]["requires_vault"]}


@deals_router.post("/deals/{deal_id}/vault/key")
async def vault_set_key(deal_id: str, body: VaultKeyIn, user: dict = Depends(get_current_user)):
    deal = await _get_deal_for_user(deal_id, user)
    if _role_in_deal(deal, user) != "buyer":
        raise HTTPException(403, "Only the buyer holds the vault key")
    if deal["status"] in policy.TERMINAL_STATUSES:
        raise HTTPException(400, "Deal is closed")
    v = deal.get("vault") or _empty_vault()
    if v.get("items"):
        raise HTTPException(400, "Key cannot be rotated after items were sealed — import your backup key instead")
    if not all(k in body.public_key for k in ("kty", "crv", "x", "y")) or body.public_key.get("crv") != "P-256":
        raise HTTPException(400, "public_key must be a P-256 ECDH JWK")
    notice = _notice("vault_key_set", "Vault key set", "ভল্ট কী সেট",
                     f"Buyer's device key fingerprint {body.fingerprint}. The seller can now seal secrets.",
                     f"ক্রেতার ডিভাইস কী ফিঙ্গারপ্রিন্ট {body.fingerprint}। বিক্রেতা এখন গোপন তথ্য সিল করতে পারেন।")
    await db.deals.update_one({"deal_id": deal_id}, {
        "$push": {"notices": notice},
        "$set": {"vault.buyer_public_key": body.public_key, "vault.key_fingerprint": body.fingerprint,
                 "vault.key_set_at": _now(), "vault.items": [], "vault.access_log": [], "updated_at": _now()}})
    return _public(await _fetch(deal_id))


@deals_router.post("/deals/{deal_id}/vault/items")
async def vault_seal(deal_id: str, body: VaultItemIn, user: dict = Depends(get_current_user)):
    deal = await _get_deal_for_user(deal_id, user)
    if _role_in_deal(deal, user) != "seller":
        raise HTTPException(403, "Only the seller seals vault items")
    if deal["status"] not in policy.VAULT_SEAL_STATUSES:
        raise HTTPException(400, "Secrets can be sealed only after funding and before settlement")
    v = deal.get("vault") or _empty_vault()
    if not v.get("buyer_public_key"):
        raise HTTPException(400, "The buyer has not set up a vault key yet")
    if not all(k in body.envelope for k in ("ephemeral_pub", "iv", "ciphertext")):
        raise HTTPException(400, "envelope must contain ephemeral_pub, iv and ciphertext")
    item = {"item_id": f"V-{uuid.uuid4().hex[:6].upper()}", "field_key": body.field_key, "label": body.label,
            "sealed_at": _now(), "by": user["user_id"], "key_fingerprint": v.get("key_fingerprint"),
            "at_rest": _fernet.encrypt(json.dumps(body.envelope).encode()).decode()}
    notice = _notice("vault_sealed", f"Vault item sealed: {body.label}", f"ভল্ট আইটেম সিল: {body.label}",
                     "The buyer can open it only after delivery is marked. Every opening is logged.",
                     "সরবরাহ চিহ্নিত হওয়ার পরই ক্রেতা খুলতে পারবেন। প্রতিটি খোলা লগ হয়।")
    await db.deals.update_one({"deal_id": deal_id}, {"$push": {"vault.items": item, "notices": notice}, "$set": {"updated_at": _now()}})
    return {"item_id": item["item_id"], "label": item["label"], "sealed_at": item["sealed_at"]}


@deals_router.post("/deals/{deal_id}/vault/items/{item_id}/reveal")
async def vault_reveal(deal_id: str, item_id: str, user: dict = Depends(get_current_user)):
    deal = await _get_deal_for_user(deal_id, user)
    if _role_in_deal(deal, user) != "buyer":
        raise HTTPException(403, "Only the buyer can open vault items")
    if deal["status"] not in policy.VAULT_REVEAL_STATUSES:
        raise HTTPException(400, "Vault items open only after the seller marks delivery")
    v = deal.get("vault") or _empty_vault()
    item = next((i for i in v.get("items", []) if i["item_id"] == item_id), None)
    if not item:
        raise HTTPException(404, "Vault item not found")
    entry = {"item_id": item_id, "label": item["label"], "by": user["user_id"], "at": _now()}
    notice = _notice("vault_revealed", f"Buyer opened vault item: {item['label']}", f"ক্রেতা ভল্ট আইটেম খুলেছেন: {item['label']}",
                     "Recorded in the vault access log.", "ভল্ট অ্যাক্সেস লগে লিপিবদ্ধ।")
    await db.deals.update_one({"deal_id": deal_id}, {"$push": {"vault.access_log": entry, "notices": notice}, "$set": {"updated_at": _now()}})
    return {"item_id": item_id, "label": item["label"], "field_key": item["field_key"],
            "envelope": json.loads(_fernet.decrypt(item["at_rest"].encode()))}


# ---------- receipt ----------
@deals_router.get("/deals/{deal_id}/receipt")
async def receipt(deal_id: str, user: dict = Depends(get_current_user)):
    deal = await _get_deal_for_user(deal_id, user, allow_reviewer=True)
    return {
        "deal_id": deal["deal_id"], "title": deal["title"], "category": deal["category"],
        "service_mode": deal["service_mode"], "status": deal["status"],
        "terms": deal["terms"], "terms_version": deal["terms_version"],
        "completion_items": deal["completion_items"],
        "ledger": deal.get("ledger", []),
        "held": policy.held_amount(deal.get("ledger", [])),
        "settlement": deal.get("settlement"),
        "dispute": deal.get("dispute"),
        "deadlines": deal.get("deadlines", {}),
        "timers": policy.compute_timers(deal),
        "vault": _vault_summary(deal),
        "notices": deal.get("notices", []),
        "generated_at": _now(),
    }


# ---------- assistant (rule-based, read-only) ----------
@deals_router.get("/deals/{deal_id}/assistant/guidance")
async def assistant_guidance(deal_id: str, user: dict = Depends(get_current_user)):
    deal = await _get_deal_for_user(deal_id, user, allow_reviewer=True)
    return {"steps": assistant.guidance_for(deal)}


@deals_router.get("/deals/{deal_id}/assistant/explain")
async def assistant_explain(deal_id: str, user: dict = Depends(get_current_user)):
    deal = await _get_deal_for_user(deal_id, user, allow_reviewer=True)
    return assistant.explain_outcome(deal)


@deals_router.get("/assistant/checklist")
async def assistant_checklist(category: str, user: dict = Depends(get_current_user)):
    return {"items": assistant.suggest_checklist(category)}

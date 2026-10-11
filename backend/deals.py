import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional

from db import db
from auth import get_current_user, require_roles
import policy
import assistant

deals_router = APIRouter(prefix="/api", tags=["deals"])


def _now():
    return datetime.now(timezone.utc).isoformat()


# ---------- schemas ----------
class TermItem(BaseModel):
    label: str


class DealCreate(BaseModel):
    category: str
    title: str
    description: str = ""
    service_mode: str = "ai_first"
    my_role: str = "buyer"               # buyer | seller
    counterparty_email: str
    amount: int = Field(ge=1)
    deadline_days: int = 7
    terms: List[str] = []


class MessageIn(BaseModel):
    text: str


class InspectIn(BaseModel):
    item_id: str
    status: str                          # PASS | FAIL | UNKNOWN
    note: str = ""


class SettleIn(BaseModel):
    path: str                            # ACCEPTED_RELEASE | MUTUAL_RESOLUTION
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


# ---------- helpers ----------
def _public(deal: dict) -> dict:
    deal.pop("_id", None)
    deal["held"] = policy.held_amount(deal.get("ledger", []))
    deal["completion_summary"] = policy.completion_summary(deal.get("completion_items", []))
    return deal


async def _get_deal_for_user(deal_id: str, user: dict, allow_reviewer: bool = False) -> dict:
    deal = await db.deals.find_one({"deal_id": deal_id}, {"_id": 0})
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


# ---------- meta ----------
@deals_router.get("/categories")
async def categories():
    return [{"code": c, **{"name_en": v["name_en"], "name_bn": v["name_bn"]}} for c, v in policy.CATEGORIES.items()]


@deals_router.get("/service-modes")
async def service_modes():
    human_count = await db.users.count_documents({"role": {"$in": ["reviewer", "admin"]}})
    out = []
    for m in policy.SERVICE_MODES:
        if m["code"] == "ai_only":
            available = True
        else:
            available = human_count > 0
        out.append({**m, "human_available": available})
    return out


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
            "items": body.terms or [i["label_en"] for i in policy.build_completion_items(body.category)],
            "version": 1,
        },
        "terms_version": 1,
        "buyer_accepted_version": None,
        "seller_accepted_version": None,
        "monitoring_consent": {"buyer": False, "seller": False},
        "completion_items": policy.build_completion_items(body.category),
        "messages": [],
        "ledger": [],
        "delivery": None,
        "dispute": None,
        "settlement": None,
        "settlement_proposal": None,
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
    return _public(deal)


@deals_router.post("/deals/{deal_id}/accept-terms")
async def accept_terms(deal_id: str, user: dict = Depends(get_current_user)):
    deal = await _get_deal_for_user(deal_id, user)
    role = _role_in_deal(deal, user)
    if not role:
        raise HTTPException(403, "Not a party to this deal")
    updates = {"updated_at": _now()}
    # claim the slot if invited-by-email
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
    return _public(await db.deals.find_one({"deal_id": deal_id}, {"_id": 0}))


@deals_router.post("/deals/{deal_id}/consent-monitoring")
async def consent_monitoring(deal_id: str, user: dict = Depends(get_current_user)):
    deal = await _get_deal_for_user(deal_id, user)
    role = _role_in_deal(deal, user)
    if not role:
        raise HTTPException(403, "Not a party")
    await db.deals.update_one({"deal_id": deal_id}, {"$set": {f"monitoring_consent.{role}": True, "updated_at": _now()}})
    return _public(await db.deals.find_one({"deal_id": deal_id}, {"_id": 0}))


@deals_router.post("/deals/{deal_id}/fund")
async def fund(deal_id: str, user: dict = Depends(get_current_user)):
    deal = await _get_deal_for_user(deal_id, user)
    if _role_in_deal(deal, user) != "buyer":
        raise HTTPException(403, "Only the buyer can fund")
    if deal["status"] != "TERMS_ACCEPTED":
        raise HTTPException(400, "Both parties must accept terms before funding")
    entry = {"type": "FUND", "amount": deal["terms"]["amount"], "from": "buyer", "to": "hold",
             "at": _now(), "by": user["user_id"], "note": "Mock funding (simulated)"}
    await db.deals.update_one({"deal_id": deal_id},
                              {"$push": {"ledger": entry}, "$set": {"status": "FUNDED", "updated_at": _now()}})
    return _public(await db.deals.find_one({"deal_id": deal_id}, {"_id": 0}))


@deals_router.post("/deals/{deal_id}/deliver")
async def deliver(deal_id: str, body: MessageIn, user: dict = Depends(get_current_user)):
    deal = await _get_deal_for_user(deal_id, user)
    if _role_in_deal(deal, user) != "seller":
        raise HTTPException(403, "Only the seller can deliver")
    if deal["status"] != "FUNDED":
        raise HTTPException(400, "Deal must be funded before delivery")
    delivery = {"note": body.text, "at": _now(), "by": user["user_id"]}
    await db.deals.update_one({"deal_id": deal_id},
                              {"$set": {"delivery": delivery, "status": "DELIVERED", "updated_at": _now()}})
    return _public(await db.deals.find_one({"deal_id": deal_id}, {"_id": 0}))


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
    return _public(await db.deals.find_one({"deal_id": deal_id}, {"_id": 0}))


# ---------- settlement ----------
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

    if body.path == "ACCEPTED_RELEASE":
        if role != "buyer":
            raise HTTPException(403, "Only the buyer can release funds to the seller")
        to_seller, to_buyer = held, 0
        return await _finalize(deal, "ACCEPTED_RELEASE", to_seller, to_buyer, "Buyer accepted and released.", user)

    if body.path == "MUTUAL_RESOLUTION":
        if body.to_seller + body.to_buyer != held:
            raise HTTPException(400, f"Split must sum to the held amount ৳{held}")
        prop = deal.get("settlement_proposal")
        if prop and prop["to_seller"] == body.to_seller and prop["to_buyer"] == body.to_buyer and prop["by_role"] != role:
            # second party approved the same split -> finalize
            return await _finalize(deal, "MUTUAL_RESOLUTION", body.to_seller, body.to_buyer,
                                   "Both parties agreed the split.", user)
        # record/overwrite proposal, await the other party
        await db.deals.update_one({"deal_id": deal_id}, {"$set": {
            "settlement_proposal": {"to_seller": body.to_seller, "to_buyer": body.to_buyer,
                                    "by_role": role, "at": _now()},
            "status": "SETTLE_PROPOSED", "updated_at": _now()}})
        return _public(await db.deals.find_one({"deal_id": deal_id}, {"_id": 0}))

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
    await db.deals.update_one({"deal_id": deal["deal_id"]}, {
        "$push": {"ledger": {"$each": ledger_add}},
        "$set": {"settlement": settlement, "status": "SETTLED", "settlement_proposal": None, "updated_at": _now()}})
    return _public(await db.deals.find_one({"deal_id": deal["deal_id"]}, {"_id": 0}))


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
        "held_snapshot": policy.held_amount(deal.get("ledger", [])),
        "status": "OPEN", "at": _now(),
        "review": None,
    }
    await db.deals.update_one({"deal_id": deal_id},
                              {"$set": {"dispute": dispute, "status": "DISPUTED", "updated_at": _now()}})
    return _public(await db.deals.find_one({"deal_id": deal_id}, {"_id": 0}))


@deals_router.get("/disputes/queue")
async def dispute_queue(user: dict = Depends(require_roles("reviewer", "admin"))):
    docs = await db.deals.find({"status": "DISPUTED"}, {"_id": 0}).sort("updated_at", 1).to_list(200)
    return [_public(d) for d in docs]


@deals_router.post("/deals/{deal_id}/review")
async def review_dispute(deal_id: str, body: ReviewIn, user: dict = Depends(require_roles("reviewer", "admin"))):
    deal = await db.deals.find_one({"deal_id": deal_id}, {"_id": 0})
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
        return _public(await db.deals.find_one({"deal_id": deal_id}, {"_id": 0}))
    if body.to_seller + body.to_buyer != held:
        raise HTTPException(400, f"Reviewed allocation must sum to the held amount ৳{held}")
    review = {"outcome": "RESOLVED", "to_seller": body.to_seller, "to_buyer": body.to_buyer,
              "reasons": body.reasons, "by": user["user_id"], "at": _now()}
    await db.deals.update_one({"deal_id": deal_id},
                              {"$set": {"dispute.review": review, "dispute.status": "RESOLVED"}})
    deal = await db.deals.find_one({"deal_id": deal_id}, {"_id": 0})
    return await _finalize(deal, "REVIEWED_RESOLUTION", body.to_seller, body.to_buyer,
                           f"Reviewer decision: {body.reasons}", user)


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

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List

from db import db
from auth import get_current_user, require_roles
import evidence

research_router = APIRouter(prefix="/api", tags=["research"])

KINDS = ("positive", "negative", "neutral", "resolution")


def _now():
    return datetime.now(timezone.utc).isoformat()


class SubjectIn(BaseModel):
    name: str
    subject_type: str = "business"       # person | business | page | domain
    aliases: List[str] = []
    handle: str = ""


class ReportIn(BaseModel):
    subject_id: str
    kind: str                            # positive | negative | neutral | resolution
    title: str
    summary: str
    source_platform: str = ""
    source_url: str = ""
    language: str = "bn"
    access_status: str = "open"          # author-declared: open | snippet_only | link_only | unavailable
    author_excerpt: str = ""             # pasted quote — fallback when the live snapshot fails
    resolution_of: Optional[str] = None  # report_id this resolves (for resolution kind)


class ResponseIn(BaseModel):
    text: str
    kind: str = "response"               # response | correction | appeal


class ModerateIn(BaseModel):
    action: str                          # publish | needs_info | reject
    note: str = ""


def _pub(doc):
    doc.pop("_id", None)
    return doc


async def _evidence_fields(body: ReportIn) -> dict:
    """Snapshot the source once (FE-04). Final access_status = auto result when a fetch was attempted."""
    snap = await evidence.snapshot_url(body.source_url) if body.source_url else None
    return {"source_url": body.source_url, "author_excerpt": body.author_excerpt,
            "declared_access_status": body.access_status,
            "access_status": snap["auto_access_status"] if snap else body.access_status,
            "snapshot": snap}


# ---------- subjects ----------
@research_router.get("/subjects")
async def search_subjects(q: str = Query("", alias="q")):
    query = {}
    if q:
        query = {"$or": [
            {"name": {"$regex": q, "$options": "i"}},
            {"handle": {"$regex": q, "$options": "i"}},
            {"aliases": {"$regex": q, "$options": "i"}},
        ]}
    docs = await db.subjects.find(query, {"_id": 0}).limit(50).to_list(50)
    # attach report counts
    for d in docs:
        counts = {k: await db.reports.count_documents({"subject_id": d["subject_id"], "kind": k, "status": "PUBLISHED"}) for k in KINDS}
        d["counts"] = counts
    return docs


@research_router.post("/subjects")
async def create_subject(body: SubjectIn, user: dict = Depends(get_current_user)):
    subject_id = f"SUB-{uuid.uuid4().hex[:8].upper()}"
    doc = {"subject_id": subject_id, "name": body.name, "subject_type": body.subject_type,
           "aliases": body.aliases, "handle": body.handle,
           "created_by": user["user_id"], "created_at": _now()}
    await db.subjects.insert_one(dict(doc))
    return _pub(dict(doc))


@research_router.get("/subjects/{subject_id}")
async def get_subject(subject_id: str):
    subj = await db.subjects.find_one({"subject_id": subject_id}, {"_id": 0})
    if not subj:
        raise HTTPException(404, "Subject not found")
    reports = await db.reports.find({"subject_id": subject_id, "status": "PUBLISHED"}, {"_id": 0}).sort("created_at", -1).to_list(200)
    counts = {k: sum(1 for r in reports if r["kind"] == k) for k in KINDS}
    return {"subject": subj, "reports": reports, "counts": counts}


@research_router.get("/compare")
async def compare(a: str = Query(...), b: str = Query(...)):
    async def profile(sid):
        subj = await db.subjects.find_one({"subject_id": sid}, {"_id": 0})
        if not subj:
            raise HTTPException(404, f"Subject {sid} not found")
        reports = await db.reports.find({"subject_id": sid, "status": "PUBLISHED"}, {"_id": 0}).to_list(500)
        counts = {k: sum(1 for r in reports if r["kind"] == k) for k in KINDS}
        latest = max((r["created_at"] for r in reports), default=None)
        return {"subject": subj, "counts": counts, "total": len(reports), "latest": latest}
    # NOTE: no overall trust score / safer-seller verdict is produced (spec C8.3 / B1).
    return {"a": await profile(a), "b": await profile(b),
            "disclaimer_en": "Coverage & recency only — no trust score or safer-seller verdict.",
            "disclaimer_bn": "শুধু কভারেজ ও সাম্প্রতিকতা — কোনো ট্রাস্ট স্কোর বা নিরাপদ-বিক্রেতা রায় নেই।"}


# ---------- community reports ----------
@research_router.post("/reports")
async def create_report(body: ReportIn, user: dict = Depends(get_current_user)):
    if body.kind not in KINDS:
        raise HTTPException(400, "Invalid kind")
    if not await db.subjects.find_one({"subject_id": body.subject_id}):
        raise HTTPException(404, "Subject not found")
    report_id = f"REP-{uuid.uuid4().hex[:8].upper()}"
    doc = {
        "report_id": report_id, "subject_id": body.subject_id, "kind": body.kind,
        "title": body.title, "summary": body.summary,
        "source_platform": body.source_platform,
        "language": body.language,
        "resolution_of": body.resolution_of,
        "author_id": user["user_id"], "author_name": user["name"],
        "origin": "community",
        "status": "DRAFT",
        "responses": [],
        "moderation_history": [],
        "snapshot_history": [],
        "created_at": _now(), "updated_at": _now(),
        **(await _evidence_fields(body)),
    }
    await db.reports.insert_one(dict(doc))
    return _pub(dict(doc))


@research_router.get("/reports/mine")
async def my_reports(user: dict = Depends(get_current_user)):
    docs = await db.reports.find({"author_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return docs


@research_router.get("/reports/{report_id}")
async def get_report(report_id: str, user: dict = Depends(get_current_user)):
    rep = await db.reports.find_one({"report_id": report_id}, {"_id": 0})
    if not rep:
        raise HTTPException(404, "Report not found")
    if rep["status"] != "PUBLISHED" and rep["author_id"] != user["user_id"] and user.get("role") not in ("reviewer", "admin"):
        raise HTTPException(403, "This report is not published")
    return rep


@research_router.post("/reports/{report_id}/refetch")
async def refetch_report(report_id: str, user: dict = Depends(get_current_user)):
    rep = await db.reports.find_one({"report_id": report_id}, {"_id": 0})
    if not rep:
        raise HTTPException(404, "Report not found")
    if rep["author_id"] != user["user_id"] and user.get("role") not in ("reviewer", "admin"):
        raise HTTPException(403, "Only the author or a reviewer can refresh the snapshot")
    if not rep.get("source_url"):
        raise HTTPException(400, "This report has no source URL to snapshot")
    snap = await evidence.snapshot_url(rep["source_url"])
    update = {"$set": {"snapshot": snap, "access_status": snap["auto_access_status"], "updated_at": _now()}}
    if rep.get("snapshot"):
        update["$push"] = {"snapshot_history": rep["snapshot"]}
    await db.reports.update_one({"report_id": report_id}, update)
    return _pub(await db.reports.find_one({"report_id": report_id}, {"_id": 0}))


@research_router.put("/reports/{report_id}")
async def edit_report(report_id: str, body: ReportIn, user: dict = Depends(get_current_user)):
    rep = await db.reports.find_one({"report_id": report_id}, {"_id": 0})
    if not rep:
        raise HTTPException(404, "Report not found")
    if rep["author_id"] != user["user_id"]:
        raise HTTPException(403, "Only the author can edit")
    if rep["status"] not in ("DRAFT", "NEEDS_INFORMATION"):
        raise HTTPException(400, "Only drafts can be edited")
    url_changed = body.source_url != rep.get("source_url")
    ev = await _evidence_fields(body) if url_changed or not rep.get("snapshot") else {
        "author_excerpt": body.author_excerpt, "declared_access_status": body.access_status}
    update = {"$set": {
        "kind": body.kind, "title": body.title, "summary": body.summary,
        "source_platform": body.source_platform, "language": body.language,
        "resolution_of": body.resolution_of, "updated_at": _now(), **ev}}
    if url_changed and rep.get("snapshot"):
        update["$push"] = {"snapshot_history": rep["snapshot"]}
    await db.reports.update_one({"report_id": report_id}, update)
    return _pub(await db.reports.find_one({"report_id": report_id}, {"_id": 0}))


@research_router.post("/reports/{report_id}/submit")
async def submit_report(report_id: str, user: dict = Depends(get_current_user)):
    rep = await db.reports.find_one({"report_id": report_id}, {"_id": 0})
    if not rep:
        raise HTTPException(404, "Report not found")
    if rep["author_id"] != user["user_id"]:
        raise HTTPException(403, "Only the author can submit")
    await db.reports.update_one({"report_id": report_id},
                                {"$set": {"status": "SUBMITTED", "updated_at": _now()}})
    return _pub(await db.reports.find_one({"report_id": report_id}, {"_id": 0}))


@research_router.post("/reports/{report_id}/respond")
async def respond_report(report_id: str, body: ResponseIn, user: dict = Depends(get_current_user)):
    rep = await db.reports.find_one({"report_id": report_id}, {"_id": 0})
    if not rep:
        raise HTTPException(404, "Report not found")
    response = {"response_id": uuid.uuid4().hex[:8], "by": user["user_id"], "by_name": user["name"],
                "kind": body.kind, "text": body.text, "at": _now()}
    await db.reports.update_one({"report_id": report_id},
                                {"$push": {"responses": response}, "$set": {"updated_at": _now()}})
    return _pub(await db.reports.find_one({"report_id": report_id}, {"_id": 0}))


# ---------- moderation (reviewer/admin) ----------
@research_router.get("/moderation/queue")
async def moderation_queue(user: dict = Depends(require_roles("reviewer", "admin"))):
    docs = await db.reports.find({"status": {"$in": ["SUBMITTED", "NEEDS_INFORMATION"]}}, {"_id": 0}).sort("updated_at", 1).to_list(200)
    return docs


@research_router.post("/reports/{report_id}/moderate")
async def moderate_report(report_id: str, body: ModerateIn, user: dict = Depends(require_roles("reviewer", "admin"))):
    rep = await db.reports.find_one({"report_id": report_id}, {"_id": 0})
    if not rep:
        raise HTTPException(404, "Report not found")
    mapping = {"publish": "PUBLISHED", "needs_info": "NEEDS_INFORMATION", "reject": "REJECTED"}
    if body.action not in mapping:
        raise HTTPException(400, "Invalid action")
    entry = {"action": body.action, "note": body.note, "by": user["user_id"], "at": _now()}
    await db.reports.update_one({"report_id": report_id}, {
        "$set": {"status": mapping[body.action], "updated_at": _now()},
        "$push": {"moderation_history": entry}})
    return _pub(await db.reports.find_one({"report_id": report_id}, {"_id": 0}))

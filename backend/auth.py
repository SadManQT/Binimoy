import os
import uuid
from datetime import datetime, timezone, timedelta

import bcrypt
import jwt
import requests
from fastapi import APIRouter, Request, Response, HTTPException, Depends
from pydantic import BaseModel, EmailStr, Field

from db import db

JWT_ALGORITHM = "HS256"
SESSION_DAYS = 7
auth_router = APIRouter(prefix="/api/auth", tags=["auth"])


# ---------- password + jwt helpers ----------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


def _set_cookie(response: Response, key: str, value: str):
    response.set_cookie(
        key=key, value=value, httponly=True, secure=True, samesite="none",
        max_age=SESSION_DAYS * 24 * 3600, path="/",
    )


def _sanitize(user: dict) -> dict:
    user.pop("password_hash", None)
    user.pop("_id", None)
    return user


def _expired(iso_value) -> bool:
    if isinstance(iso_value, str):
        dt = datetime.fromisoformat(iso_value)
    else:
        dt = iso_value
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt < datetime.now(timezone.utc)


# ---------- current user resolver (accepts session_token OR jwt) ----------
async def get_current_user(request: Request) -> dict:
    cookie_session = request.cookies.get("session_token")
    cookie_access = request.cookies.get("access_token")
    bearer = None
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        bearer = header[7:]

    # 1) session_token flow (cookie or bearer)
    for tok in (cookie_session, bearer):
        if tok:
            sess = await db.user_sessions.find_one({"session_token": tok})
            if sess and not _expired(sess["expires_at"]):
                user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
                if user:
                    return _sanitize(user)

    # 2) jwt flow (cookie or bearer)
    for tok in (cookie_access, bearer):
        if tok:
            try:
                payload = jwt.decode(tok, _jwt_secret(), algorithms=[JWT_ALGORITHM])
                if payload.get("type") == "access":
                    user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
                    if user:
                        return _sanitize(user)
            except jwt.PyJWTError:
                continue

    raise HTTPException(status_code=401, detail="Not authenticated")


def require_roles(*roles):
    async def dep(user: dict = Depends(get_current_user)):
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail=f"Requires role: {', '.join(roles)}")
        return user
    return dep


# ---------- schemas ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class SessionIn(BaseModel):
    session_id: str


# ---------- endpoints ----------
@auth_router.post("/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": user_id,
        "email": email,
        "name": body.name,
        "role": "user",
        "picture": None,
        "password_hash": hash_password(body.password),
        "auth_provider": "password",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    token = create_access_token(user_id, email)
    _set_cookie(response, "access_token", token)
    return {"user": _sanitize(dict(doc)), "access_token": token}


@auth_router.post("/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["user_id"], email)
    _set_cookie(response, "access_token", token)
    return {"user": _sanitize(dict(user)), "access_token": token}


@auth_router.post("/session")
async def google_session(body: SessionIn, response: Response):
    url = os.environ["EMERGENT_SESSION_DATA_URL"]
    try:
        r = requests.get(url, headers={"X-Session-ID": body.session_id}, timeout=15)
    except Exception:
        raise HTTPException(status_code=502, detail="Auth provider unreachable")
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    data = r.json()
    email = data["email"].lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data.get("name"), "picture": data.get("picture")}},
        )
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user = {
            "user_id": user_id,
            "email": email,
            "name": data.get("name"),
            "role": "user",
            "picture": data.get("picture"),
            "password_hash": None,
            "auth_provider": "google",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(dict(user))

    session_token = data.get("session_token") or f"sess_{uuid.uuid4().hex}"
    expires_at = (datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)).isoformat()
    await db.user_sessions.insert_one(
        {"user_id": user_id, "session_token": session_token, "expires_at": expires_at,
         "created_at": datetime.now(timezone.utc).isoformat()}
    )
    _set_cookie(response, "session_token", session_token)
    return {"user": _sanitize(dict(user))}


@auth_router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@auth_router.post("/logout")
async def logout(request: Request, response: Response):
    tok = request.cookies.get("session_token")
    if tok:
        await db.user_sessions.delete_one({"session_token": tok})
    response.delete_cookie("session_token", path="/")
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

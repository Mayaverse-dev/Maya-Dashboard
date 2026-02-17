import os
import secrets
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel

from . import db


# Local dev convenience: load env vars from .env if present.
# Does not override existing process environment (e.g. Railway).
load_dotenv(override=False)

COOKIE_NAME = "maya_auth_token"
JWT_ALGORITHM = "HS256"


class LoginRequest(BaseModel):
    password: str


def _now_ts() -> int:
    return int(time.time())


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        # Don't leak configuration details to clients.
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def _get_jwt_ttl_seconds() -> int:
    raw = os.getenv("JWT_TTL_SECONDS", "604800")  # 7 days
    try:
        ttl = int(raw)
    except ValueError:
        ttl = 604800
    return max(60, ttl)  # minimum 1 minute


def _cookie_domain() -> Optional[str]:
    # When set (e.g. ".entermaya.com"), cookie becomes shared across subdomains.
    return os.getenv("COOKIE_DOMAIN") or None


def _cookie_security_mode(domain: Optional[str]) -> Dict[str, Any]:
    # Local dev: no COOKIE_DOMAIN, use lax + insecure cookies.
    # Production (shared cookie across subdomains): COOKIE_DOMAIN set, use SameSite=None + Secure.
    if domain:
        return {"secure": True, "samesite": "none"}
    return {"secure": False, "samesite": "lax"}


def _issue_token() -> str:
    secret = _get_required_env("SHARED_JWT_SECRET")
    now = _now_ts()
    ttl = _get_jwt_ttl_seconds()
    payload = {
        "sub": "metrics-portal",
        "iat": now,
        "exp": now + ttl,
        "scope": "metrics",
    }
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


def _verify_token(token: str) -> Dict[str, Any]:
    secret = _get_required_env("SHARED_JWT_SECRET")
    try:
        payload = jwt.decode(token, secret, algorithms=[JWT_ALGORITHM])
        if not isinstance(payload, dict):
            raise HTTPException(status_code=401, detail="Invalid authentication")
        return payload
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Session expired") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="Invalid authentication") from exc


def verify_maya_auth(request: Request) -> Dict[str, Any]:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return _verify_token(token)


def _set_auth_cookie(response: Response, token: str) -> None:
    domain = _cookie_domain()
    security = _cookie_security_mode(domain)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=security["secure"],
        samesite=security["samesite"],
        domain=domain,
        path="/",
        max_age=_get_jwt_ttl_seconds(),
    )


def _clear_auth_cookie(response: Response) -> None:
    domain = _cookie_domain()
    security = _cookie_security_mode(domain)
    # Use an explicit Set-Cookie to reliably overwrite attributes.
    response.set_cookie(
        key=COOKIE_NAME,
        value="",
        httponly=True,
        secure=security["secure"],
        samesite=security["samesite"],
        domain=domain,
        path="/",
        max_age=0,
        expires=0,
    )


app = FastAPI(title="Metrics Portal")


@app.on_event("startup")
def _startup() -> None:
    db.open_pool()


@app.on_event("shutdown")
def _shutdown() -> None:
    db.close_pool()


@app.get("/api/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/api/login")
def login(body: LoginRequest) -> Response:
    try:
        expected = _get_required_env("METRICS_PORTAL_PASSWORD")
    except RuntimeError:
        raise HTTPException(status_code=500, detail="Server misconfigured")

    if not secrets.compare_digest(body.password, expected):
        raise HTTPException(status_code=401, detail="Invalid password")

    token = _issue_token()
    response = JSONResponse({"ok": True})
    _set_auth_cookie(response, token)
    return response


@app.get("/api/verify")
def verify(payload: Dict[str, Any] = Depends(verify_maya_auth)) -> Dict[str, Any]:
    # Keep this response minimal; clients can use it as an auth gate.
    return {"ok": True, "sub": payload.get("sub"), "exp": payload.get("exp")}


@app.post("/api/logout")
def logout() -> Response:
    response = JSONResponse({"ok": True})
    _clear_auth_cookie(response)
    return response


def _where_days(days: int) -> Tuple[str, list[Any]]:
    if days <= 0:
        return "", []
    return "WHERE e.created_at >= (CURRENT_TIMESTAMP - (%s * interval '1 day'))", [days]


def _ebook_stats_payload(days: int) -> Dict[str, Any]:
    if days > 3650:
        days = 3650

    where_sql, params = _where_days(days)

    try:
        # User summary: how many unique users visited (page_view),
        # downloaded pdf, downloaded epub, downloaded both.
        # Only count users that still exist in public.users.
        user_summary = db.fetch_all(
            f"""
            WITH scoped AS (
                SELECT e.user_id, e.event_type, e."format"
                FROM ebook.download_events e
                JOIN public.users u ON u.id = e.user_id
                {where_sql}
            ),
            per_user AS (
                SELECT
                    user_id,
                    BOOL_OR(event_type = 'page_view') AS visited,
                    BOOL_OR(event_type = 'download_url_issued' AND "format" IN ('pdf', 'pdf-compressed')) AS dl_pdf,
                    BOOL_OR(event_type = 'download_url_issued' AND "format" = 'pdf') AS dl_pdf_full,
                    BOOL_OR(event_type = 'download_url_issued' AND "format" = 'pdf-compressed') AS dl_pdf_compressed,
                    BOOL_OR(event_type = 'download_url_issued' AND "format" = 'epub') AS dl_epub,
                    BOOL_OR(event_type = 'send_to_kindle_click') AS dl_kindle
                FROM scoped
                GROUP BY user_id
            )
            SELECT
                COUNT(*) FILTER (WHERE visited)::bigint AS visited,
                COUNT(*) FILTER (WHERE dl_pdf)::bigint AS pdf,
                COUNT(*) FILTER (WHERE dl_pdf_full)::bigint AS pdf_full,
                COUNT(*) FILTER (WHERE dl_pdf_compressed)::bigint AS pdf_compressed,
                COUNT(*) FILTER (WHERE dl_epub)::bigint AS epub,
                COUNT(*) FILTER (WHERE dl_pdf AND dl_epub)::bigint AS both,
                COUNT(*) FILTER (WHERE dl_pdf AND NOT dl_epub)::bigint AS pdf_only,
                COUNT(*) FILTER (WHERE dl_epub AND NOT dl_pdf)::bigint AS epub_only,
                COUNT(*) FILTER (WHERE dl_kindle)::bigint AS kindle
            FROM per_user
            """,
            params,
        )

        # User list with details cross-referenced from public.users.
        users = db.fetch_all(
            f"""
            WITH scoped AS (
                SELECT e.user_id, e.event_type, e."format"
                FROM ebook.download_events e
                {where_sql}
            ),
            per_user AS (
                SELECT
                    user_id,
                    BOOL_OR(event_type = 'page_view') AS visited,
                    BOOL_OR(event_type = 'download_url_issued' AND "format" IN ('pdf', 'pdf-compressed')) AS dl_pdf,
                    BOOL_OR(event_type = 'download_url_issued' AND "format" = 'pdf') AS dl_pdf_full,
                    BOOL_OR(event_type = 'download_url_issued' AND "format" = 'pdf-compressed') AS dl_pdf_compressed,
                    BOOL_OR(event_type = 'download_url_issued' AND "format" = 'epub') AS dl_epub,
                    BOOL_OR(event_type = 'send_to_kindle_click') AS dl_kindle
                FROM scoped
                GROUP BY user_id
            )
            SELECT
                u.id,
                u.email,
                COALESCE(u.backer_name, '') AS name,
                COALESCE(u.reward_title, '') AS reward_title,
                p.visited,
                p.dl_pdf,
                p.dl_pdf_full,
                p.dl_pdf_compressed,
                p.dl_epub,
                p.dl_kindle
            FROM per_user p
            JOIN public.users u ON u.id = p.user_id
            ORDER BY u.id
            """,
            params,
        )

    except Exception as exc:
        raise HTTPException(status_code=500, detail="Database query failed") from exc

    return {
        "ok": True,
        "generated_at": _now_iso(),
        "window_days": days,
        "user_summary": user_summary[0] if user_summary else {
            "visited": 0,
            "pdf": 0,
            "pdf_full": 0,
            "pdf_compressed": 0,
            "epub": 0,
            "both": 0,
            "pdf_only": 0,
            "epub_only": 0,
            "kindle": 0,
        },
        "users": users,
    }


@app.get("/api/ebook/stats")
def ebook_stats(days: int = 30, payload: Dict[str, Any] = Depends(verify_maya_auth)) -> Dict[str, Any]:
    _ = payload
    return _ebook_stats_payload(days)


@app.post("/api/ebook/sync")
def ebook_sync(days: int = 30, payload: Dict[str, Any] = Depends(verify_maya_auth)) -> Dict[str, Any]:
    _ = payload
    return _ebook_stats_payload(days)


# ─────────────────────────────────────────────────────────────────────────────
# Pledge Manager stats
# ─────────────────────────────────────────────────────────────────────────────

def _pledge_manager_stats_payload() -> Dict[str, Any]:
    try:
        # Count total users
        total_users = db.fetch_all(
            "SELECT COUNT(*)::bigint AS count FROM public.users"
        )

        # Count users with shipping addresses (have at least one order with shipping_address)
        users_with_address = db.fetch_all(
            """
            SELECT COUNT(DISTINCT o.user_id)::bigint AS count
            FROM public.orders o
            JOIN public.users u ON u.id = o.user_id
            WHERE o.shipping_address IS NOT NULL AND o.shipping_address != ''
            """
        )

    except Exception as exc:
        raise HTTPException(status_code=500, detail="Database query failed") from exc

    return {
        "ok": True,
        "generated_at": _now_iso(),
        "summary": {
            "total_users": total_users[0]["count"] if total_users else 0,
            "users_with_address": users_with_address[0]["count"] if users_with_address else 0,
        },
    }


@app.get("/api/pledge-manager/stats")
def pledge_manager_stats(payload: Dict[str, Any] = Depends(verify_maya_auth)) -> Dict[str, Any]:
    _ = payload
    return _pledge_manager_stats_payload()


@app.post("/api/pledge-manager/sync")
def pledge_manager_sync(payload: Dict[str, Any] = Depends(verify_maya_auth)) -> Dict[str, Any]:
    _ = payload
    return _pledge_manager_stats_payload()


def _dist_dir() -> Path:
    # backend/main.py -> repo_root/frontend/dist
    return Path(__file__).resolve().parent.parent / "frontend" / "dist"


def _safe_join(base: Path, relative_path: str) -> Path:
    # Prevent path traversal; only allow normal relative paths.
    rel = Path(relative_path)
    if rel.is_absolute() or ".." in rel.parts:
        raise HTTPException(status_code=404, detail="Not found")
    return base / rel


@app.get("/{full_path:path}", include_in_schema=False)
def spa_fallback(full_path: str) -> Response:
    # Never handle API routes here.
    if full_path == "api" or full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")

    dist = _dist_dir()
    if not dist.exists():
        return JSONResponse(
            {
                "ok": False,
                "message": "Frontend not built. For local dev: run the Vite dev server in ./frontend",
            },
            status_code=404,
        )

    index_file = dist / "index.html"
    if not index_file.exists():
        raise HTTPException(status_code=500, detail="Frontend build missing index.html")

    if not full_path:
        return FileResponse(index_file)

    candidate = _safe_join(dist, full_path)
    if candidate.is_file():
        return FileResponse(candidate)

    # SPA route fallback
    return FileResponse(index_file)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)


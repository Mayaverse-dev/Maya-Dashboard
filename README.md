# Maya Dashboard (Parent Portal + Metrics)

Central auth + metrics portal for the Maya tools ecosystem.

This service:
- serves a portal-style login page
- issues a shared JWT cookie (domain configurable) so sibling subdomain apps can share auth
- serves an internal metrics page (`/ebook`) that reads from Postgres (`ebook.download_events`)
- deploys as a single Railway service (FastAPI backend + built Vite React frontend)

## Architecture

```
<portal-domain> (this service)
  /api/login         -> sets shared cookie (JWT)
  /api/verify        -> validates cookie
  /api/logout        -> clears cookie
  /api/ebook/stats   -> protected eBook stats (read-only)
  /api/ebook/sync    -> protected refresh-only re-fetch
  /*                -> serves React SPA (frontend/dist)

<tool-subdomain-1> (other services)
  validate cookie using SHARED_JWT_SECRET

<tool-subdomain-2> (other services)
  validate cookie using SHARED_JWT_SECRET
```

## Environment Variables

Required:
- `METRICS_PORTAL_PASSWORD`: shared password for login
- `SHARED_JWT_SECRET`: secret for signing/verifying JWTs (use a long random string)

Recommended:
- `COOKIE_DOMAIN`: e.g. `.entermaya.com` (enables cookie sharing across subdomains)
- `DATABASE_URL`: e.g. `postgresql://localhost:5432/maya_db` (local dev default)
- `JWT_TTL_SECONDS`: default `604800` (7 days)

Notes:
- When `COOKIE_DOMAIN` is set, cookies are set with `SameSite=None; Secure` (requires HTTPS).
- When `COOKIE_DOMAIN` is not set (local dev), cookies use `SameSite=Lax` and are not `Secure`.

## Local Development

Backend:
```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Frontend (optional, for faster UI iteration):
```sh
cd frontend
npm install
npm run dev
```

Open:
- Backend-served SPA: `http://127.0.0.1:8000/` (requires `frontend` build)
- Vite dev: `http://127.0.0.1:5173/` (proxies `/api` to `:8000`)

Build frontend for backend serving:
```sh
cd frontend
npm run build
```

## Deployment (Railway)

This repo includes `railway.json` + `nixpacks.toml`.

Set Railway variables:
- `METRICS_PORTAL_PASSWORD`
- `SHARED_JWT_SECRET`
- `COOKIE_DOMAIN` (e.g. `.entermaya.com`)
- `DATABASE_URL` (Railway Postgres URL, if you want DB-backed metrics in prod)

Start command:
- `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`

## Integration Guide: Put Another Service Behind This Portal

Any service hosted on a sibling subdomain can protect routes by verifying the
shared cookie:
- cookie name: `maya_auth_token`
- JWT algorithm: `HS256`
- secret: `SHARED_JWT_SECRET` (must match this portal)

### 1) Backend Middleware (FastAPI example)

Add this to your service:

```python
import os
import jwt
from fastapi import Depends, HTTPException, Request

SHARED_JWT_SECRET = os.getenv("SHARED_JWT_SECRET")
COOKIE_NAME = "maya_auth_token"

def verify_maya_auth(request: Request):
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        return jwt.decode(token, SHARED_JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid authentication")

# Usage:
# @app.get("/protected")
# async def protected_route(user = Depends(verify_maya_auth)):
#     return {"ok": True, "user": user}
```

If your service is a browser app and you want to redirect unauthenticated users
to the portal, do it on the client when you receive a `401` (or use a dedicated
HTML redirect route).

### 2) Frontend Auth Check (generic)

When calling your backend, ensure requests include cookies:
- `fetch(..., { credentials: 'include' })`
- or axios `withCredentials: true`

On `401`, redirect the user to the portal domain.

### 3) Cookie Domain Requirements

To share auth across subdomains, the portal must set `COOKIE_DOMAIN` to the
parent domain (leading dot), for example:
- `.entermaya.com`

Then your sibling services must be hosted under that same parent domain.


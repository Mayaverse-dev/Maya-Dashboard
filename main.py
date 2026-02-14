"""
Compatibility shim.

The backend now lives under `backend/`. This file remains so existing commands
like `uvicorn main:app --reload` keep working.
"""

from backend.main import app  # noqa: F401


if __name__ == "__main__":
    import os

    import uvicorn

    uvicorn.run("backend.main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)


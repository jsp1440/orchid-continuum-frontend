"""Local independent integration harness: real canonical University router, no service stubs."""
import os
import socket

for key in list(os.environ):
    if "DATABASE_URL" in key or key.endswith("API_KEY") or key.startswith("OCU_SUPABASE_") or key.startswith("CALYX_OWNER_"):
        os.environ.pop(key, None)
os.environ.update({
    "NO_API_MODE": "true",
    "CALYX_API_KEY": "ocu-independent-review-local-key",
    "OCU_UNIVERSITY_ENABLED": "true",
    "OCU_UNIVERSITY_SESSION_WRITES_ENABLED": "false",
    "OCU_UNIVERSITY_LEARNER_AUTH_ENABLED": "false",
    "OCU_UNIVERSITY_DURABLE_SESSIONS_ENABLED": "false",
    "OCU_UNIVERSITY_READ_ONLY_RELEASE_VERIFIED": "false",
})
_connect = socket.socket.connect
def local_only_connect(sock, address):
    if isinstance(address, tuple) and str(address[0]) not in {"127.0.0.1", "::1", "localhost"}:
        raise RuntimeError("External network prohibited in independent local review")
    return _connect(sock, address)
socket.socket.connect = local_only_connect

from fastapi import FastAPI
from app.university.routes import router

app = FastAPI()
app.include_router(router, prefix="/api")

import os
import traceback

import requests
from dotenv import load_dotenv

load_dotenv()

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:3000")
LOG_INGEST_SECRET = os.environ.get("LOG_INGEST_SECRET")


def report_error(source: str, exc: Exception) -> None:
    """Best-effort POST of a real ai-services failure to the DevPulse
    backend's /logs/ingest-error, the same connected-project intake path
    an external team's project would use. Never raises - a monitoring
    call failing must not turn one real error into two.
    """
    if not LOG_INGEST_SECRET:
        return

    try:
        requests.post(
            f"{BACKEND_URL}/logs/ingest-error",
            headers={"x-log-ingest-secret": LOG_INGEST_SECRET},
            json={
                "project": "ai-services",
                "level": "error",
                "message": str(exc),
                "stack": traceback.format_exc(),
                "source": source,
            },
            # ingestProjectError does synchronous DB writes plus, when
            # applicable, a live Jira API call and a WhatsApp escalation
            # send - each can take a few seconds, so 5s was measured to be
            # too tight and produced a false "failed to report" (the
            # backend had actually already indexed everything).
            timeout=15,
        )
    except requests.RequestException as report_exc:
        print(f"Failed to report error to DevPulse backend (non-blocking): {report_exc}")

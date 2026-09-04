"""
Direct port of src/agent/transcribe.js.

IMPORTANT: language="ur" is hardcoded intentionally, matching the
original Node implementation. Per DevPulse-Status.md, this exact
configuration is CONFIRMED WORKING for both English and Urdu/Roman
Urdu audio. Do not "fix" this during porting — it is not a bug,
it is tested behavior.
"""
import os
from groq import Groq
from dotenv import load_dotenv
from correct_transcript import correct_transcript

load_dotenv()

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

TRANSCRIBE_PROMPT = (
    "Engineering team standup update. Severity levels: P1, P2, P3, P4. "
    "Terms: deployment, staging, production, incident, blocker, rollback, API, database."
)


def transcribe_audio(buffer: bytes, mime_type: str = "audio/ogg") -> str:
    transcription = client.audio.transcriptions.create(
        file=("voice-note.ogg", buffer),
        model="whisper-large-v3",
        language="ur",
        prompt=TRANSCRIBE_PROMPT,
    )

    return correct_transcript(transcription.text)
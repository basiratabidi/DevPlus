"""
Direct port of src/agent/transcribe.js, since revised.

UPDATE: the previous hardcoded language="ur" was found, with real voice
note evidence, to actively corrupt English speech - it forces Whisper to
phonetically transliterate English words into Urdu script rather than
transcribe them as English (e.g. "the production deployment failed... the
API returned a 500 error" came back as pure Urdu-script phonetic garbage:
"ڈی پروڈکشن اپرائمنگ فیلڈ..."). This wasn't a hypothesis - it was
reproduced live and the language tag / agent response were confirmed
downstream-correct given that corrupted input, i.e. the bug is entirely
here, not further down the pipeline.

Switched to auto-detection (no forced `language`), using
response_format="verbose_json" so Whisper's own detected language is
available for debug logging. The domain-vocabulary `prompt` below still
biases vocabulary/spelling without hard-locking the script the way a
forced `language` parameter does.

Known risk: auto-detect can still occasionally misfire on short/ambiguous
clips (this was the original reason "ur" got hardcoded). If Urdu voice
notes regress after this change, that needs to be re-evaluated with real
audio evidence the same way this fix was - don't revert blindly either
way without testing.
"""
import os
import logging
from groq import Groq
from dotenv import load_dotenv
from correct_transcript import correct_transcript

load_dotenv()
logger = logging.getLogger(__name__)

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

# WhatsApp voice notes are normally audio/ogg (opus), but the Cloud API
# delivers any forwarded/shared audio file under the same message
# type="audio" too - those can be real mp3/m4a/aac/etc, not ogg. Groq's
# Whisper endpoint infers the container from the filename extension, so
# hardcoding "voice-note.ogg" regardless of the actual mime type causes a
# real 400 invalid_media_file for anything that isn't actually ogg
# (reproduced live, see incident #1 in DevPulse's own error log).
MIME_TO_EXTENSION = {
    "audio/ogg": "ogg",
    "audio/opus": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aac": "aac",
    "audio/amr": "amr",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/webm": "webm",
}


def _filename_for_mime_type(mime_type: str) -> str:
    normalized = (mime_type or "").split(";")[0].strip().lower()
    extension = MIME_TO_EXTENSION.get(normalized, "ogg")
    return f"voice-note.{extension}"

TRANSCRIBE_PROMPT = (
    "Engineering team standup update, in English or Urdu, often mixing English "
    "technical terms into Urdu sentences. Severity levels: P1, P2, P3, P4. "
    "Terms: deployment, staging, production, incident, blocker, rollback, API, "
    "database, deploy, server. "
    "مثال: پروڈکشن ڈاؤن ہو گیا ہے، یہ ایک P1 انسیڈنٹ ہے۔ "
    "میں نے لاگ ان کا بگ فکس کر دیا ہے۔ "
    "ڈیٹا بیس کنیکٹ نہیں ہو رہا، اسٹیجنگ پر ڈیپلائے کرنا ہے۔"
)


# Whisper's verbose_json `language` field is typically a full name
# ("english"/"urdu"), not always a 2-letter code - match both forms.
PLAUSIBLE_LANGUAGES = {"en", "english", "ur", "urdu"}


def transcribe_audio(buffer: bytes, mime_type: str = "audio/ogg") -> str:
    filename = _filename_for_mime_type(mime_type)
    transcription = client.audio.transcriptions.create(
        file=(filename, buffer),
        model="whisper-large-v3",
        prompt=TRANSCRIBE_PROMPT,
        response_format="verbose_json",
    )
    detected_lang = (getattr(transcription, "language", None) or "").lower()
    logger.warning("Whisper auto-detected language=%s", detected_lang)

    if detected_lang not in PLAUSIBLE_LANGUAGES:
        # Auto-detect landed on a language that isn't realistic for this
        # user base (confirmed failure mode: real Urdu speech
        # misidentified as Turkish). Retry once, forcing Urdu - by the
        # time we get here, auto-detect has already effectively ruled out
        # "this is confidently English" (it would have said "en" if so),
        # so forcing the other real candidate is a targeted correction,
        # not a blanket bias applied to every request.
        logger.warning("Implausible detected language, retrying forced language=ur")
        transcription = client.audio.transcriptions.create(
            file=(filename, buffer),
            model="whisper-large-v3",
            language="ur",
            prompt=TRANSCRIBE_PROMPT,
        )

    return correct_transcript(transcription.text)
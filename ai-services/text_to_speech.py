"""
Direct port of src/agent/textToSpeech.js.
Uses the Python `gTTS` package (same underlying Google Translate TTS
service as the Node `gtts` package used in the original).
"""
import io
from gtts import gTTS
from transliterate import prepare_for_speech


def text_to_speech(text: str) -> bytes:
    result = prepare_for_speech(text)
    lang = result["lang"]
    prepared_text = result["text"]

    tts = gTTS(text=prepared_text, lang=lang)
    buffer = io.BytesIO()
    tts.write_to_fp(buffer)
    buffer.seek(0)
    return buffer.read()
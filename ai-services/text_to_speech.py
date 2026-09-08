import io
import logging
from gtts import gTTS
from transliterate import prepare_for_speech

logger = logging.getLogger(__name__)

def text_to_speech(text: str) -> bytes:
    result = prepare_for_speech(text)
    lang = result["lang"]
    prepared_text = result["text"]

    logger.warning("TTS INPUT=%r -> lang=%s prepared=%r", text, lang, prepared_text)

    tts = gTTS(text=prepared_text, lang=lang)
    buffer = io.BytesIO()
    tts.write_to_fp(buffer)
    buffer.seek(0)
    return buffer.read()
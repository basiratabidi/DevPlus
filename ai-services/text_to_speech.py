"""
TTS via Meta MMS (VITS). Replaces gTTS.
facebook/mms-tts-eng for English, facebook/mms-tts-urd-script_arabic for Urdu.
Confirmed: urd-script_arabic tokenizer has is_uroman=False - takes native
Urdu script directly, no uroman preprocessing needed.

Output is converted from WAV to MP3 before returning, since WhatsApp's
Cloud API rejects audio/wav - only aac, mp4, mpeg, amr, ogg, opus are
accepted for audio messages. Conversion requires ffmpeg installed at the
OS level inside the container (see Dockerfile) - pydub is just a wrapper
around it, not a pure-Python codec.
"""
import io
import logging
import torch
import scipy.io.wavfile
from pydub import AudioSegment
from transformers import VitsModel, VitsTokenizer
from transliterate import prepare_for_speech

logger = logging.getLogger(__name__)

_MODEL_IDS = {
    "en": "facebook/mms-tts-eng",
    "ur": "facebook/mms-tts-urd-script_arabic",
}

_models = {}
_tokenizers = {}


def _load(lang: str):
    if lang not in _models:
        model_id = _MODEL_IDS[lang]
        logger.info("Loading MMS TTS model: %s", model_id)
        _tokenizers[lang] = VitsTokenizer.from_pretrained(model_id)
        _models[lang] = VitsModel.from_pretrained(model_id)
        _models[lang].eval()
    return _models[lang], _tokenizers[lang]


def text_to_speech(text: str) -> bytes:
    result = prepare_for_speech(text)
    lang = result["lang"]
    prepared_text = result["text"]

    logger.warning("TTS INPUT=%r -> lang=%s prepared=%r", text, lang, prepared_text)

    model, tokenizer = _load(lang)
    inputs = tokenizer(text=prepared_text, return_tensors="pt")

    with torch.no_grad():
        waveform = model(**inputs).waveform[0]

    wav_buffer = io.BytesIO()
    scipy.io.wavfile.write(wav_buffer, rate=model.config.sampling_rate, data=waveform.numpy())
    wav_buffer.seek(0)

    audio = AudioSegment.from_wav(wav_buffer)
    mp3_buffer = io.BytesIO()
    audio.export(mp3_buffer, format="mp3")
    mp3_buffer.seek(0)
    return mp3_buffer.read()




# google text to speech

# import io
# import logging
# from gtts import gTTS
# from transliterate import prepare_for_speech

# logger = logging.getLogger(__name__)

# def text_to_speech(text: str) -> bytes:
#     result = prepare_for_speech(text)
#     lang = result["lang"]
#     prepared_text = result["text"]

#     logger.warning("TTS INPUT=%r -> lang=%s prepared=%r", text, lang, prepared_text)

#     tts = gTTS(text=prepared_text, lang=lang)
#     buffer = io.BytesIO()
#     tts.write_to_fp(buffer)
#     buffer.seek(0)
#     return buffer.read()
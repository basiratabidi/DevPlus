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
import re
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

_URDU_SCRIPT_RANGE = re.compile(r'[؀-ۿݐ-ݿ]')

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


def text_to_speech(text: str, known_lang: str | None = None) -> bytes:
    # If the caller already knows the conversation's language (from the
    # deterministic input tag - see languageTag.js), and the reply text is
    # consistent with it, skip the independent LLM classification below
    # entirely - avoids a second, potentially-disagreeing language
    # decision for what should be one continuous language thread. Only
    # applies to the unambiguous single-language cases; "mixed", an
    # unrecognized hint, or a mismatch (e.g. tagged "english" but the
    # reply somehow contains Urdu script) still falls through to the
    # existing classify+transliterate step, since that genuinely needs
    # judgment (mixed replies still need one VITS voice chosen, and Roman
    # Urdu in the reply still needs script conversion for the tokenizer).
    # The Urdu VITS tokenizer's vocabulary is Urdu-script only - any Latin
    # letters (embedded English words, "P1"/"P2" severity codes, etc.) get
    # silently DROPPED, not mispronounced (confirmed: "severity" and every
    # "P" in "P1, P2, P3... P4" vanished entirely, leaving only bare
    # digits - this is what produced garbled/incomplete-sounding audio).
    # So the known_lang fast path below may only skip transliteration when
    # there's no Latin content to lose - any Latin letters mean it must
    # still go through prepare_for_speech(), which at least phonetically
    # renders some of that content into Urdu script.
    has_urdu_script = bool(_URDU_SCRIPT_RANGE.search(text))
    has_latin_letters = bool(re.search(r'[a-zA-Z]', text))
    if known_lang == "english" and not has_urdu_script:
        lang, prepared_text = "en", text
        logger.warning("TTS using known_lang=english, skipping LLM classification")
    elif known_lang == "urdu" and has_urdu_script and not has_latin_letters:
        lang, prepared_text = "ur", text
        logger.warning("TTS using known_lang=urdu, skipping LLM classification")
    else:
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
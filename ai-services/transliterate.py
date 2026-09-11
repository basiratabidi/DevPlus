"""
Direct port of src/agent/transliterate.js, extended with a local
Urdu-specialized model as the primary classifier/transliterator.

Classifies input text as english / urdu_script / roman_urdu, and for
roman_urdu, converts it to proper Urdu script. Used only to prepare
text for TTS voice/script selection.

Tries the local Urdu Llama 3.1 model (served via llama.cpp, see
docker-compose.yml's urdu-llm service) first, since it's specialized
for this language. Falls back to Groq's general-purpose model if the
local model is unreachable (e.g. still loading) or returns something
that doesn't parse as the expected JSON shape - this task must not go
fully offline just because the local model hiccups.
"""
import os
import json
import logging
import requests
from groq import Groq
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

GROQ_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")
URDU_LLM_URL = os.environ.get("URDU_LLM_URL", "http://urdu-llm:8080")

SYSTEM_PROMPT = """Classify the input text as one of: "english", "urdu_script", or "roman_urdu" (Urdu words spelled in Latin letters, common in Pakistani texting).

Respond with ONLY a JSON object, no other text, in this exact shape:
{"lang": "en" or "ur", "text": "..."}

Rules:
- If english: lang="en", text=the input unchanged.
- If urdu_script or roman_urdu: lang="ur", text=the FULL input in Urdu
  script - this includes phonetically rendering ANY embedded Latin-script
  words/codes into Urdu script too (e.g. "severity" -> "سیوریٹی", "P1" ->
  "پی ون"), even if most of the input is already Urdu script. This is not
  optional: the Urdu voice engine's vocabulary is Urdu-script only and
  silently DROPS any Latin letters it receives, so a literal "P1" or
  "server" left un-rendered will not be spoken at all, not just
  mispronounced.

Common terms and their Urdu-script phonetic renderings:
P1/P2/P3/P4 -> پی ون / پی ٹو / پی تھری / پی فور
severity -> سیوریٹی
deployment -> ڈپلائمنٹ
database -> ڈیٹا بیس
server -> سرور
API -> اے پی آئی
production -> پروڈکشن
staging -> اسٹیجنگ
blocker -> بلاکر
incident -> انسیڈنٹ

Examples:
Input: "I fixed the login bug"
Output: {"lang": "en", "text": "I fixed the login bug"}

Input: "aj mera mood bht kharab tha kiun ky meri tabiyat down horahi thi"
Output: {"lang": "ur", "text": "آج میرا موڈ بہت خراب تھا کیونکہ میری طبیعت ڈاؤن ہو رہی تھی"}

Input: "yeh bug kal fix ho jayega"
Output: {"lang": "ur", "text": "یہ بگ کل فکس ہو جائے گا"}

Input: "مجھے اس کی severity جاننی ہے۔ P1, P2, P3 یا P4؟"
Output: {"lang": "ur", "text": "مجھے اس کی سیوریٹی جاننی ہے۔ پی ون, پی ٹو, پی تھری یا پی فور؟"}

Input: "server is down, urgent"
Output: {"lang": "en", "text": "server is down, urgent"}"""


def _parse_result(raw_content: str) -> dict | None:
    try:
        result = json.loads(raw_content)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(result, dict) or "text" not in result:
        return None
    lang = "ur" if result.get("lang") == "ur" else "en"
    return {"lang": lang, "text": result.get("text")}


def _prepare_via_local_model(text: str) -> dict | None:
    try:
        response = requests.post(
            f"{URDU_LLM_URL}/v1/chat/completions",
            json={
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": text},
                ],
                "temperature": 0,
            },
            timeout=15,
        )
        response.raise_for_status()
        raw_content = response.json()["choices"][0]["message"]["content"]
    except (requests.RequestException, KeyError, IndexError) as err:
        logger.warning("Local Urdu model unavailable, falling back to Groq: %s", err)
        return None
    return _parse_result(raw_content)


def _prepare_via_groq(text: str) -> dict:
    completion = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        temperature=0,
        response_format={"type": "json_object"},
    )
    result = _parse_result(completion.choices[0].message.content)
    # Groq with response_format=json_object is reliable enough that this
    # should never actually be None, but don't crash the whole request on
    # the off chance it is - degrade to "treat as English, unchanged"
    # rather than raising past the caller.
    return result or {"lang": "en", "text": text}


def prepare_for_speech(text: str) -> dict:
    # NOTE: tried routing this through a local Urdu-specialized Llama 3.1
    # model (urdu-llm service, currently stopped) first - measured ~2.4
    # tok/s on this CPU-only host even using all cores, and it didn't
    # reliably stop at a clean JSON reply (190+ tokens, still rambling).
    # That's unusable per-message latency, so reverted to Groq directly.
    # _prepare_via_local_model() is left in place in case a smaller/faster
    # model is worth trying later.
    result = _prepare_via_groq(text)
    logger.info("Language detection: input=%s lang=%s output=%s", text, result.get("lang"), result.get("text"))
    return result
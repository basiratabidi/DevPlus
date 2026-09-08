"""
Direct port of src/agent/transliterate.js.

Classifies input text as english / urdu_script / roman_urdu, and for
roman_urdu, converts it to proper Urdu script. Used only to prepare
text for TTS voice/script selection.
"""
import os
import json
import logging
from groq import Groq
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

GROQ_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")

SYSTEM_PROMPT = """Classify the input text as one of: "english", "urdu_script", or "roman_urdu" (Urdu words spelled in Latin letters, common in Pakistani texting).

Respond with ONLY a JSON object, no other text, in this exact shape:
{"lang": "en" or "ur", "text": "..."}

Rules:
- If english: lang="en", text=the input unchanged.
- If urdu_script: lang="ur", text=the input unchanged.
- If roman_urdu: lang="ur", text=the input converted to proper Urdu script.

Examples:
Input: "I fixed the login bug"
Output: {"lang": "en", "text": "I fixed the login bug"}

Input: "aj mera mood bht kharab tha kiun ky meri tabiyat down horahi thi"
Output: {"lang": "ur", "text": "آج میرا موڈ بہت خراب تھا کیونکہ میری طبیعت ڈاؤن ہو رہی تھی"}

Input: "yeh bug kal fix ho jayega"
Output: {"lang": "ur", "text": "یہ بگ کل فکس ہو جائے گا"}

Input: "server is down, urgent"
Output: {"lang": "en", "text": "server is down, urgent"}"""


def prepare_for_speech(text: str) -> dict:
    completion = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        temperature=0,
        response_format={"type": "json_object"},
    )

    result = json.loads(completion.choices[0].message.content)
    logger.info("Language detection: input=%s lang=%s output=%s", text, result.get("lang"), result.get("text"))

    lang = "ur" if result.get("lang") == "ur" else "en"
    return {"lang": lang, "text": result.get("text")}
import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Detects whether text is English, Urdu script, or Roman Urdu, and
 * returns { lang, text } ready for TTS:
 * - English -> { lang: 'en', text: unchanged }
 * - Urdu script -> { lang: 'ur', text: unchanged }
 * - Roman Urdu -> { lang: 'ur', text: transliterated to Urdu script }
 *
 * NOTE: relies on Groq's general-purpose LLM, not a dedicated language
 * detector - reliable for clearly one language or the other, may be
 * less precise on heavily mixed English/Urdu sentences.
 */
export async function prepareForSpeech(text) {
  const completion = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    messages: [
      {
        role: 'system',
        content: `Classify the input text as one of: "english", "urdu_script", or "roman_urdu" (Urdu words spelled in Latin letters).

Respond with ONLY a JSON object, no other text, in this exact shape:
{"lang": "en" or "ur", "text": "..."}

Rules:
- If english: lang="en", text=the input unchanged.
- If urdu_script: lang="ur", text=the input unchanged.
- If roman_urdu: lang="ur", text=the input converted to proper Urdu script.`,
      },
      { role: 'user', content: text },
    ],
    temperature: 0,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(completion.choices[0].message.content);
  return { lang: result.lang === 'ur' ? 'ur' : 'en', text: result.text };
}

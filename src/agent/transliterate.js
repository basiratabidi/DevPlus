import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function prepareForSpeech(text) {
  const completion = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    messages: [
      {
        role: 'system',
        content: `Classify the input text as one of: "english", "urdu_script", or "roman_urdu" (Urdu words spelled in Latin letters, common in Pakistani texting).

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
Output: {"lang": "en", "text": "server is down, urgent"}`,
      },
      { role: 'user', content: text },
    ],
    temperature: 0,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(completion.choices[0].message.content);
  console.log('Language detection:', { input: text, lang: result.lang, output: result.text });
  return { lang: result.lang === 'ur' ? 'ur' : 'en', text: result.text };
}

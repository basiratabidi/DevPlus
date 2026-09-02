import GTTS from 'gtts';
import { prepareForSpeech } from './transliterate.js';

/**
 * Converts text to speech, auto-detecting English vs Urdu/Roman Urdu
 * and picking the matching voice + script.
 */
export async function textToSpeech(text) {
  const { lang, text: preparedText } = await prepareForSpeech(text);

  return new Promise((resolve, reject) => {
    const gtts = new GTTS(preparedText, lang);
    const chunks = [];
    const stream = gtts.stream();

    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

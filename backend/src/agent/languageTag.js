/**
 * Deterministic (non-LLM) classification of a transcribed voice message's
 * language, used to tag the message before it reaches the agent.
 *
 * Rule-based on purpose, not LLM-based: LLM-inferred language was found
 * to be non-deterministic even at temperature 0, and this tag needs to
 * be a stable signal the agent can trust as authoritative - not another
 * probabilistic guess layered on top of Whisper's own noise.
 *
 * Per project convention, Urdu script and Roman Urdu are the same spoken
 * language in two writing conventions - both classify as "urdu". "mixed"
 * is reserved for genuine code-switching (multiple real English words
 * alongside Urdu grammar), not just a couple of English technical nouns
 * inside an Urdu sentence (e.g. "mera deployment fail ho gaya" is urdu/
 * mixed, never plain "english", despite "deployment" being English).
 */

const URDU_SCRIPT_RANGE = /[؀-ۿݐ-ݿ]/;

// Common Roman Urdu function/grammar words. Presence of these is a strong
// deterministic signal of Urdu content, since (unlike technical nouns)
// they carry no meaning as English words - a sentence can't contain "hai"
// or "nahi" by coincidentally using English vocabulary.
// Deliberately excludes words that collide with common English vocabulary
// even though they're also valid Roman Urdu spellings, since a false
// positive here corrupts classification of plain English text: "the",
// "me", "tab" (browser/keyboard tab), "par" (golf/"on par"), "ya" (casual
// English filler), "ho" (English interjection).
const ROMAN_URDU_MARKERS = new Set([
  'hai', 'hain', 'ho', 'hun', 'hoon', 'hua', 'hui', 'hue', 'hoga', 'hogi',
  'gaya', 'gayi', 'gaye', 'kar', 'karo', 'karna', 'kiya', 'ki', 'kya',
  'nahi', 'nahin', 'mein', 'se', 'ka', 'ke', 'aur', 'lekin',
  'abhi', 'phir', 'wala', 'wali', 'wale', 'tha', 'thi', 'raha',
  'rahi', 'rahe', 'ab', 'kal', 'aaj', 'mera', 'meri', 'mere', 'mujhe',
  'tum', 'tumhara', 'aap', 'theek', 'thik', 'bhi', 'sab', 'kuch', 'koi',
  'yeh', 'ye', 'woh', 'wo', 'jo', 'jab', 'kyun', 'kyu', 'kaise',
  'kahan', 'kab', 'kitna', 'kitni', 'sath', 'saath', 'liye', 'diya',
  'dedo', 'karke', 'karunga', 'karungi', 'ker', 'pe',
]);

// Below this many non-marker (real English) words, don't call it "mixed"
// just for a couple of technical nouns riding along in an Urdu sentence.
const ENGLISH_WORD_THRESHOLD = 3;

/**
 * @param {string} text - raw transcript (already Whisper + correction-layer output)
 * @returns {'english' | 'urdu' | 'mixed'}
 */
export function classifyLanguage(text) {
  if (!text || !text.trim()) return 'english';

  const hasUrduScript = URDU_SCRIPT_RANGE.test(text);

  const words = text.toLowerCase().match(/[a-z']+/g) || [];
  let romanUrduHits = 0;
  for (const w of words) {
    if (ROMAN_URDU_MARKERS.has(w)) romanUrduHits++;
  }
  const otherWordCount = words.length - romanUrduHits;
  const hasRomanUrdu = romanUrduHits >= 1;
  const hasSubstantialEnglish = otherWordCount >= ENGLISH_WORD_THRESHOLD;

  if (hasUrduScript && !hasSubstantialEnglish) return 'urdu';
  if (hasUrduScript && hasSubstantialEnglish) return 'mixed';
  if (hasRomanUrdu && hasSubstantialEnglish) return 'mixed';
  if (hasRomanUrdu) return 'urdu';
  return 'english';
}

const TAG_LABELS = {
  english: 'ENGLISH',
  urdu: 'URDU',
  mixed: 'MIXED (Urdu/English code-switched)',
};

/**
 * Builds the tagged message passed to the agent. The transcript itself
 * is preserved exactly as transcribed (no forced script conversion) -
 * only a language label is prepended, per the project's principle that
 * explicit tagging should be authoritative without altering the actual
 * spoken content.
 */
export function buildTaggedMessage(text) {
  const lang = classifyLanguage(text);
  return {
    lang,
    taggedMessage: `[LANGUAGE: ${TAG_LABELS[lang]}]\n${text}`,
  };
}

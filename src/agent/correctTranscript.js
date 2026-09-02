/**
 * Deterministic post-processing for known STT confusions in a narrow,
 * high-stakes vocabulary (severity levels). Whisper commonly mishears
 * "P1" as "B1", "V1", "T1", etc. since these are acoustically similar
 * single letters. A regex rule is more reliable here than trying to
 * coax a probabilistic model into getting a closed vocabulary right.
 *
 * Matches severity mentions as a standalone token (word boundary) so it
 * won't incorrectly rewrite unrelated words containing "b1" etc.
 */
const SEVERITY_CORRECTIONS = [
  { pattern: /\b[BVDTPbvdtp]\s?1\b/gi, replacement: 'P1' },
  { pattern: /\b[BVDTPbvdtp]\s?2\b/gi, replacement: 'P2' },
  { pattern: /\b[BVDTPbvdtp]\s?3\b/gi, replacement: 'P3' },
  { pattern: /\b[BVDTPbvdtp]\s?4\b/gi, replacement: 'P4' },
];

export function correctTranscript(text) {
  let corrected = text;
  for (const { pattern, replacement } of SEVERITY_CORRECTIONS) {
    corrected = corrected.replace(pattern, replacement);
  }
  return corrected;
}

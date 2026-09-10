"""
Deterministic post-processing for known STT confusions in a narrow,
high-stakes vocabulary (severity levels, and domain compound words).
Whisper commonly mishears "P1" as "B1", "V1", "T1", etc, and commonly
splits/hyphenates compound tech terms inconsistently ("roll back" vs
"rollback"). Only covers confirmed, narrow confusion patterns - not a
general spell-checker, since guessing at corrections for genuinely
garbled speech risks turning wrong words into different wrong words.
"""
import re

SEVERITY_CORRECTIONS = [
    (re.compile(r'\b[BVDTPbvdtp]\s?1\b'), 'P1'),
    (re.compile(r'\b[BVDTPbvdtp]\s?2\b'), 'P2'),
    (re.compile(r'\b[BVDTPbvdtp]\s?3\b'), 'P3'),
    (re.compile(r'\b[BVDTPbvdtp]\s?4\b'), 'P4'),
]

# Compound domain terms Whisper often splits or hyphenates inconsistently.
# Case-insensitive; \s*-?\s* covers "roll back", "roll-back", "rollback".
COMPOUND_TERM_CORRECTIONS = [
    (re.compile(r'\broll\s*-?\s*back\b', re.IGNORECASE), 'rollback'),
    (re.compile(r'\bdata\s*-?\s*base\b', re.IGNORECASE), 'database'),
    (re.compile(r'\bstand\s*-?\s*up\b', re.IGNORECASE), 'standup'),
    (re.compile(r'\bde\s*-?\s*ploy\b', re.IGNORECASE), 'deploy'),
    (re.compile(r'\bback\s*-?\s*end\b', re.IGNORECASE), 'backend'),
    (re.compile(r'\bfront\s*-?\s*end\b', re.IGNORECASE), 'frontend'),
]


def correct_transcript(text: str) -> str:
    corrected = text
    for pattern, replacement in SEVERITY_CORRECTIONS:
        corrected = pattern.sub(replacement, corrected)
    for pattern, replacement in COMPOUND_TERM_CORRECTIONS:
        corrected = pattern.sub(replacement, corrected)
    return corrected
"""
Deterministic post-processing for known STT confusions in a narrow,
high-stakes vocabulary (severity levels). Whisper commonly mishears
"P1" as "B1", "V1", "T1", etc. Direct port of
src/agent/correctTranscript.js — behavior must match exactly.
"""
import re

SEVERITY_CORRECTIONS = [
    (re.compile(r'\b[BVDTPbvdtp]\s?1\b'), 'P1'),
    (re.compile(r'\b[BVDTPbvdtp]\s?2\b'), 'P2'),
    (re.compile(r'\b[BVDTPbvdtp]\s?3\b'), 'P3'),
    (re.compile(r'\b[BVDTPbvdtp]\s?4\b'), 'P4'),
]


def correct_transcript(text: str) -> str:
    corrected = text
    for pattern, replacement in SEVERITY_CORRECTIONS:
        corrected = pattern.sub(replacement, corrected)
    return corrected
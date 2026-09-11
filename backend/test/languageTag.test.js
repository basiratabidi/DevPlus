import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifyLanguage, buildTaggedMessage } from '../src/agent/languageTag.js';

// Mirrors docs/TEST_CASES.md Module 9: Voice Pipeline, Language Tagging

describe('classifyLanguage', () => {
  test('TC-LNG-01: pure English classifies correctly', () => {
    assert.equal(classifyLanguage('fixed the login bug'), 'english');
  });

  test('TC-LNG-02: English sentence with Roman-Urdu-lookalike words does not false-positive', () => {
    assert.equal(classifyLanguage("check the browser tab, it's on par with staging"), 'english');
  });

  test('TC-LNG-03: Roman Urdu classifies correctly', () => {
    assert.equal(classifyLanguage('Mera deployment complete ho gaya hai'), 'urdu');
  });

  test('TC-LNG-04: Urdu script classifies correctly', () => {
    assert.equal(classifyLanguage('میرا ڈپلائمنٹ مکمل ہو گیا ہے'), 'urdu');
  });

  test('TC-LNG-05: genuine code-switching classifies as mixed', () => {
    assert.equal(
      classifyLanguage('Main ne PR merge kar diya hai lekin staging pe build fail ho raha hai'),
      'mixed'
    );
  });

  test('TC-LNG-06: a couple of technical nouns alone do not force english', () => {
    const result = classifyLanguage('Mera deployment production mein fail ho gaya');
    assert.notEqual(result, 'english');
    assert.ok(['urdu', 'mixed'].includes(result));
  });

  test('TC-LNG-08: empty transcript returns a safe default rather than throwing', () => {
    assert.equal(classifyLanguage(''), 'english');
    assert.equal(classifyLanguage('   '), 'english');
    assert.equal(classifyLanguage(null), 'english');
    assert.equal(classifyLanguage(undefined), 'english');
  });

  test('single Roman Urdu marker word with no other content classifies as urdu', () => {
    assert.equal(classifyLanguage('hai'), 'urdu');
  });

  test('sentence with three or more genuine English words alongside Urdu-script text is mixed', () => {
    assert.equal(
      classifyLanguage('یہ deployment production server پر fail ہو گیا ہے because of a config error'),
      'mixed'
    );
  });
});

describe('buildTaggedMessage', () => {
  test('tags an English message with [LANGUAGE: ENGLISH] and preserves the original text', () => {
    const { lang, taggedMessage } = buildTaggedMessage('fixed the login bug');
    assert.equal(lang, 'english');
    assert.equal(taggedMessage, '[LANGUAGE: ENGLISH]\nfixed the login bug');
  });

  test('tags a Roman Urdu message with [LANGUAGE: URDU]', () => {
    const { lang, taggedMessage } = buildTaggedMessage('Mera deployment complete ho gaya hai');
    assert.equal(lang, 'urdu');
    assert.equal(taggedMessage, '[LANGUAGE: URDU]\nMera deployment complete ho gaya hai');
  });

  test('tags a code-switched message with the MIXED label', () => {
    const { lang, taggedMessage } = buildTaggedMessage(
      'Main ne PR merge kar diya hai lekin staging pe build fail ho raha hai'
    );
    assert.equal(lang, 'mixed');
    assert.match(taggedMessage, /^\[LANGUAGE: MIXED \(Urdu\/English code-switched\)\]\n/);
  });

  test('does not alter the transcript content itself, only prepends the tag', () => {
    const original = 'the CDN is still serving stale assets';
    const { taggedMessage } = buildTaggedMessage(original);
    assert.ok(taggedMessage.endsWith(`\n${original}`));
  });
});

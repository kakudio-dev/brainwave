import { describe, it, expect } from 'vitest';
import {
  validateDeckInput,
  isValidationError,
  MIN_WORDS_PER_DECK,
  MAX_WORDS_PER_DECK,
  MAX_WORD_LENGTH,
  MAX_DECK_NAME_LENGTH
} from './decks';

function makeWords(count: number, prefix = 'word'): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${i}`);
}

describe('validateDeckInput', () => {
  it('accepts a well-formed deck', () => {
    const result = validateDeckInput({
      name: '  My Deck  ',
      words: makeWords(MIN_WORDS_PER_DECK)
    });
    expect(isValidationError(result)).toBe(false);
    if (!isValidationError(result)) {
      expect(result.name).toBe('My Deck');
      expect(result.words).toHaveLength(MIN_WORDS_PER_DECK);
    }
  });

  it('rejects missing body', () => {
    const result = validateDeckInput(null);
    expect(isValidationError(result)).toBe(true);
  });

  it('rejects empty name', () => {
    const result = validateDeckInput({ name: '   ', words: makeWords(MIN_WORDS_PER_DECK) });
    expect(isValidationError(result)).toBe(true);
    if (isValidationError(result)) expect(result.field).toBe('name');
  });

  it('rejects names over the length limit', () => {
    const result = validateDeckInput({
      name: 'x'.repeat(MAX_DECK_NAME_LENGTH + 1),
      words: makeWords(MIN_WORDS_PER_DECK)
    });
    expect(isValidationError(result)).toBe(true);
    if (isValidationError(result)) expect(result.field).toBe('name');
  });

  it('rejects when fewer than the minimum words remain after cleaning', () => {
    const result = validateDeckInput({
      name: 'Test',
      words: makeWords(MIN_WORDS_PER_DECK - 1)
    });
    expect(isValidationError(result)).toBe(true);
    if (isValidationError(result)) expect(result.field).toBe('words');
  });

  it('rejects words over the length limit', () => {
    const words = makeWords(MIN_WORDS_PER_DECK - 1);
    words.push('a'.repeat(MAX_WORD_LENGTH + 1));
    const result = validateDeckInput({ name: 'Test', words });
    expect(isValidationError(result)).toBe(true);
    if (isValidationError(result)) expect(result.field).toBe('words');
  });

  it('trims whitespace and collapses internal runs', () => {
    const result = validateDeckInput({
      name: 'Test',
      words: [
        '  hello   world  ',
        ...makeWords(MIN_WORDS_PER_DECK - 1, 'foo')
      ]
    });
    expect(isValidationError(result)).toBe(false);
    if (!isValidationError(result)) {
      expect(result.words[0]).toBe('hello world');
    }
  });

  it('dedupes case-insensitively', () => {
    const result = validateDeckInput({
      name: 'Test',
      words: [
        'Apple',
        'apple',
        'APPLE',
        ...makeWords(MIN_WORDS_PER_DECK, 'fill')
      ]
    });
    expect(isValidationError(result)).toBe(false);
    if (!isValidationError(result)) {
      const appleCount = result.words.filter(w => w.toLowerCase() === 'apple').length;
      expect(appleCount).toBe(1);
    }
  });

  it('skips empty and non-string entries silently', () => {
    const result = validateDeckInput({
      name: 'Test',
      words: ['   ', '', 42, null, undefined, ...makeWords(MIN_WORDS_PER_DECK)]
    });
    expect(isValidationError(result)).toBe(false);
    if (!isValidationError(result)) {
      expect(result.words).toHaveLength(MIN_WORDS_PER_DECK);
    }
  });

  it('rejects decks over the maximum word count', () => {
    const result = validateDeckInput({
      name: 'Test',
      words: makeWords(MAX_WORDS_PER_DECK + 1)
    });
    expect(isValidationError(result)).toBe(true);
    if (isValidationError(result)) expect(result.field).toBe('words');
  });

  it('rejects non-array words field', () => {
    const result = validateDeckInput({ name: 'Test', words: 'word1,word2' });
    expect(isValidationError(result)).toBe(true);
    if (isValidationError(result)) expect(result.field).toBe('words');
  });
});

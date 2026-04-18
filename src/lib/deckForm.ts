// Client-side helpers that mirror the server validation in
// functions/_shared/decks.ts. Kept in sync by hand — if the rules
// diverge, the server is authoritative and will reject.

export const MIN_WORDS_PER_DECK = 10;
export const MAX_WORDS_PER_DECK = 1000;
export const MAX_WORD_LENGTH = 30;
export const MAX_DECK_NAME_LENGTH = 60;
export const MAX_DECKS_PER_ACCOUNT = 50;

export function parseWordsFromText(raw: string): string[] {
  // Users paste lists where entries are separated by newlines or commas.
  const parts = raw.split(/[\n,]/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const w = p.replace(/\s+/g, ' ').trim();
    if (!w) continue;
    const key = w.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

export interface ClientValidation {
  ok: boolean;
  error?: string;
  cleanedName?: string;
  cleanedWords?: string[];
}

export function validateDeckForm(name: string, wordsText: string): ClientValidation {
  const cleanedName = name.trim();
  if (cleanedName.length === 0) {
    return { ok: false, error: 'Please name your deck.' };
  }
  if (cleanedName.length > MAX_DECK_NAME_LENGTH) {
    return { ok: false, error: `Name must be ${MAX_DECK_NAME_LENGTH} characters or fewer.` };
  }

  const cleanedWords = parseWordsFromText(wordsText);
  const tooLong = cleanedWords.find(w => w.length > MAX_WORD_LENGTH);
  if (tooLong) {
    return {
      ok: false,
      error: `"${truncate(tooLong, 20)}" is longer than ${MAX_WORD_LENGTH} characters.`
    };
  }
  if (cleanedWords.length < MIN_WORDS_PER_DECK) {
    return {
      ok: false,
      error: `You need at least ${MIN_WORDS_PER_DECK} unique words (you have ${cleanedWords.length}).`
    };
  }
  if (cleanedWords.length > MAX_WORDS_PER_DECK) {
    return {
      ok: false,
      error: `A deck can have at most ${MAX_WORDS_PER_DECK} words (you have ${cleanedWords.length}).`
    };
  }

  return { ok: true, cleanedName, cleanedWords };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

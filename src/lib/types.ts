export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  score: number;
  connected: boolean;
}

export type GameStatus = 'lobby' | 'playing' | 'finished';

export interface RoundWord {
  word: string;
  result: 'correct' | 'pass' | 'timeout';
}

export interface GameState {
  code: string;
  players: Player[];
  status: GameStatus;
  currentGuesserIndex: number;
  currentWord: string | null;
  wordsRemaining: number;
  // Wall-clock timestamp (ms, server epoch) when the current round ends, or
  // null when no round is active. Clients interpolate the countdown locally
  // from this so the server doesn't have to tick once a second.
  roundEndsAt: number | null;
  category: string;
  roundNumber: number;
  totalRounds: number;
  wordRevealed: boolean;
  lastWordResult: 'correct' | 'pass' | null;
  roundWords: RoundWord[];
  showingRoundSummary: boolean;
  nextGuesserIndex: number;
}

export type Category = 'movies' | 'animals' | 'famous-people' | 'actions';

export const CATEGORY_LABELS: Record<Category, string> = {
  'movies': 'Movies',
  'animals': 'Animals',
  'famous-people': 'Famous People',
  'actions': 'Actions'
};

// Client -> Server messages
export type ClientMessage =
  | { type: 'join'; name: string; playerId: string }
  | { type: 'start'; category: Category }
  | { type: 'correct' }
  | { type: 'pass' }
  | { type: 'nextWord' }
  | { type: 'startNextRound' }
  | { type: 'skipTurn' }
  | { type: 'playAgain' };

// Server -> Client messages
export type ServerMessage =
  | { type: 'state'; state: GameState; playerId: string | null }
  | { type: 'word'; word: string }
  | { type: 'error'; message: string }
  | { type: 'roundEnd'; guesserId: string; score: number }
  | { type: 'gameEnd'; players: Player[] };

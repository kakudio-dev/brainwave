export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  score: number;
}

export type GameStatus = 'lobby' | 'playing' | 'finished';

export interface GameState {
  code: string;
  players: Player[];
  status: GameStatus;
  currentGuesserIndex: number;
  currentWord: string | null;
  wordsRemaining: number;
  roundTimeLeft: number;
  category: string;
  roundNumber: number;
  totalRounds: number;
  lastChanceMode: boolean;
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
  | { type: 'join'; name: string }
  | { type: 'start'; category: Category }
  | { type: 'correct' }
  | { type: 'pass' }
  | { type: 'nextRound' }
  | { type: 'playAgain' };

// Server -> Client messages
export type ServerMessage =
  | { type: 'state'; state: GameState; playerId: string }
  | { type: 'word'; word: string }
  | { type: 'error'; message: string }
  | { type: 'roundEnd'; guesserId: string; score: number }
  | { type: 'gameEnd'; players: Player[] };

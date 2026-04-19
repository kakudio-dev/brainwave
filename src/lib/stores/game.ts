import { writable, derived, get } from 'svelte/store';
import type { GameState, Player } from '$lib/types';

// Core game state from server
export const gameState = writable<GameState | null>(null);

// Current player's ID (set on connection)
export const playerId = writable<string | null>(null);

// Current word (only shown to non-guessers)
export const currentWord = writable<string | null>(null);

// Connection status
export const connectionStatus = writable<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');

// Error messages
export const errorMessage = writable<string | null>(null);

// Round end event
export const roundEndEvent = writable<{ guesserId: string; score: number } | null>(null);

// Clock offset between server and client in ms. Positive means the server's
// clock is ahead of the client's. Updated on every state broadcast.
// Use `Date.now() + $serverClockOffset` to get the server's current time.
export const serverClockOffset = writable<number>(0);

// Derived stores
export const currentPlayer = derived(
  [gameState, playerId],
  ([$gameState, $playerId]) => {
    if (!$gameState || !$playerId) return null;
    return $gameState.players.find(p => p.id === $playerId) ?? null;
  }
);

export const isHost = derived(
  currentPlayer,
  ($currentPlayer) => $currentPlayer?.isHost ?? false
);

export const isGuesser = derived(
  [gameState, playerId],
  ([$gameState, $playerId]) => {
    if (!$gameState || !$playerId) return false;
    const guesser = $gameState.players[$gameState.currentGuesserIndex];
    return guesser?.id === $playerId;
  }
);

export const currentGuesser = derived(
  gameState,
  ($gameState) => {
    if (!$gameState) return null;
    return $gameState.players[$gameState.currentGuesserIndex] ?? null;
  }
);

export const nextGuesser = derived(
  gameState,
  ($gameState) => {
    if (!$gameState) return null;
    return $gameState.players[$gameState.nextGuesserIndex] ?? null;
  }
);

export const isNextGuesser = derived(
  [gameState, playerId],
  ([$gameState, $playerId]) => {
    if (!$gameState || !$playerId) return false;
    const next = $gameState.players[$gameState.nextGuesserIndex];
    return next?.id === $playerId;
  }
);

// Reset all stores
export function resetStores() {
  gameState.set(null);
  playerId.set(null);
  currentWord.set(null);
  connectionStatus.set('disconnected');
  errorMessage.set(null);
  roundEndEvent.set(null);
  serverClockOffset.set(0);
}

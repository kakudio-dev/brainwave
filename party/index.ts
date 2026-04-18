import type * as Party from "partykit/server";
import { getShuffledWords, type Category } from "./words";

const ROUND_DURATION = 60; // seconds

// Duplicated from functions/_shared/decks.ts because the PartyKit server
// and Pages Functions deploy separately and don't share a module graph.
// Kept in lockstep with those values by hand.
const MIN_WORDS_PER_DECK = 10;
const MAX_WORDS_PER_DECK = 1000;
const MAX_WORD_LENGTH = 30;
const MAX_DECK_NAME_LENGTH = 60;

/**
 * Sanitize a client-supplied word list: trim, collapse whitespace, drop
 * empties and overlong entries, dedupe case-insensitively. Mirrors the
 * validation in functions/_shared/decks.ts — if that ever diverges, the
 * server becomes the last line of defense.
 */
function sanitizeCustomWords(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rawWord of raw) {
    if (typeof rawWord !== 'string') continue;
    const w = rawWord.replace(/\s+/g, ' ').trim();
    if (w.length === 0 || w.length > MAX_WORD_LENGTH) continue;
    const key = w.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

interface Player {
  id: string;          // stable, client-provided UUID (persists across reconnects)
  name: string;
  isHost: boolean;
  score: number;
  connected: boolean;  // current WebSocket status
}

interface RoundWord {
  word: string;
  result: 'correct' | 'pass' | 'timeout';
}

interface GameState {
  code: string;
  players: Player[];
  status: 'lobby' | 'playing' | 'finished';
  currentGuesserIndex: number;
  currentWord: string | null;
  revealedWord: string | null;
  wordsRemaining: string[];
  wordsUsed: string[];
  // Wall-clock timestamp (ms) when the current round ends. null when no round
  // is active. The DO sets a Durable Object alarm to this time and hibernates
  // in between; clients compute their countdown locally from the timestamp.
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

type ClientMessage =
  | { type: 'join'; name: string; playerId: string }
  // Start a game with either a built-in category OR an explicit word list.
  // When `words` is present (and non-empty) the server uses those and labels
  // the round with `deckName`. Otherwise it falls back to the built-in
  // category picker in words.ts.
  | { type: 'start'; category: Category; words?: string[]; deckName?: string }
  | { type: 'correct' }
  | { type: 'pass' }
  | { type: 'nextWord' }
  | { type: 'startNextRound' }
  | { type: 'skipTurn' }
  | { type: 'playAgain' };

export default class BrainwaveServer implements Party.Server {
  state: GameState;
  nextGamePlayers: Player[] = []; // Players waiting in lobby for next game
  // conn.id -> player.id (stable UUID). Populated on join, cleared on disconnect.
  connToPlayer = new Map<string, string>();

  constructor(readonly room: Party.Room) {
    this.state = {
      code: room.id.toUpperCase(),
      players: [],
      status: 'lobby',
      currentGuesserIndex: 0,
      currentWord: null,
      revealedWord: null,
      wordsRemaining: [],
      wordsUsed: [],
      roundEndsAt: null,
      category: '',
      roundNumber: 0,
      totalRounds: 0,
      wordRevealed: false,
      lastWordResult: null,
      roundWords: [],
      showingRoundSummary: false,
      nextGuesserIndex: 0
    };
  }

  onConnect(conn: Party.Connection, _ctx: Party.ConnectionContext) {
    // Send current state. playerId unknown until the client sends join.
    this.sendToConnection(conn, {
      type: 'state',
      state: this.getPublicState(),
      playerId: null
    });
  }

  onMessage(message: string, sender: Party.Connection) {
    try {
      const msg = JSON.parse(message) as ClientMessage;

      switch (msg.type) {
        case 'join':
          this.handleJoin(sender, msg.name, msg.playerId);
          break;
        case 'start':
          this.handleStart(sender, msg.category, msg.words, msg.deckName);
          break;
        case 'correct':
          this.handleCorrect(sender);
          break;
        case 'pass':
          this.handlePass(sender);
          break;
        case 'nextWord':
          this.handleNextWord(sender);
          break;
        case 'startNextRound':
          this.handleStartNextRound(sender);
          break;
        case 'skipTurn':
          this.handleSkipTurn(sender);
          break;
        case 'playAgain':
          this.handlePlayAgain(sender);
          break;
      }
    } catch (e) {
      console.error('Error parsing message:', e);
    }
  }

  onClose(conn: Party.Connection) {
    this.handleDisconnect(conn);
  }

  async onAlarm() {
    // Durable Object wakes us up at the round deadline. End the round if we
    // haven't already done so some other way (explicit skip, all words used).
    if (this.state.status === 'playing' && !this.state.showingRoundSummary) {
      this.endRound();
    }
  }

  private playerFor(conn: Party.Connection): Player | undefined {
    const pid = this.connToPlayer.get(conn.id);
    if (!pid) return undefined;
    return this.state.players.find(p => p.id === pid);
  }

  private handleJoin(conn: Party.Connection, name: string, playerId: string) {
    if (!playerId) {
      this.sendToConnection(conn, { type: 'error', message: 'Missing playerId' });
      return;
    }

    const existing = this.state.players.find(p => p.id === playerId);
    if (existing) {
      // Reconnect: update connection mapping, mark online, refresh name
      this.connToPlayer.set(conn.id, playerId);
      existing.connected = true;
      existing.name = name.trim().slice(0, 20) || existing.name;

      // Also mark connected in the rematch lobby if they're there
      const pending = this.nextGamePlayers.find(p => p.id === playerId);
      if (pending) pending.connected = true;

      this.broadcastState();
      // If the reconnecting player is currently in the rematch lobby, they also
      // need to see the rematch-specific lobby state (shown after game end).
      if (pending) this.sendLobbyState(conn);
      return;
    }

    // Truly new player (not a reconnect)
    if (this.state.status === 'playing') {
      this.sendToConnection(conn, {
        type: 'error',
        message: 'Game already in progress'
      });
      return;
    }

    const player: Player = {
      id: playerId,
      name: name.trim().slice(0, 20),
      isHost: this.connectedPlayers().length === 0,
      score: 0,
      connected: true
    };

    this.state.players.push(player);
    this.connToPlayer.set(conn.id, playerId);
    this.broadcastState();
  }

  private handleDisconnect(conn: Party.Connection) {
    const playerId = this.connToPlayer.get(conn.id);
    this.connToPlayer.delete(conn.id);
    if (!playerId) return;

    // If another connection still owns this player (e.g. a second tab), leave them online.
    const stillConnected = Array.from(this.connToPlayer.values()).includes(playerId);

    const mainPlayer = this.state.players.find(p => p.id === playerId);
    const pending = this.nextGamePlayers.find(p => p.id === playerId);

    if (this.state.status === 'lobby') {
      // Lobby phase: fully remove so the host can start without waiting on ghosts.
      if (mainPlayer) this.removeFromMain(mainPlayer);
      if (pending) this.removeFromPending(pending);
      // If the room empties, reset.
      if (this.state.players.length === 0 && this.room.getConnections().next().done) {
        this.resetRoom();
        return;
      }
      this.broadcastState();
      if (pending) this.broadcastLobbyToNextGamePlayers();
      return;
    }

    // Playing / finished: preserve turn order and scores; just mark offline.
    if (!stillConnected) {
      if (mainPlayer) mainPlayer.connected = false;
      if (pending) pending.connected = false;
      // If every player has been offline AND no connections remain, reset the room.
      if (this.state.players.every(p => !p.connected) && this.room.getConnections().next().done) {
        this.resetRoom();
        return;
      }
    }

    this.broadcastState();
    if (pending) this.broadcastLobbyToNextGamePlayers();
  }

  private removeFromMain(player: Player) {
    const idx = this.state.players.indexOf(player);
    if (idx === -1) return;
    const wasHost = player.isHost;
    this.state.players.splice(idx, 1);
    if (wasHost && this.state.players.length > 0) {
      this.state.players[0].isHost = true;
    }
  }

  private removeFromPending(player: Player) {
    const idx = this.nextGamePlayers.indexOf(player);
    if (idx === -1) return;
    const wasHost = player.isHost;
    this.nextGamePlayers.splice(idx, 1);
    if (wasHost && this.nextGamePlayers.length > 0) {
      this.nextGamePlayers[0].isHost = true;
    }
  }

  private connectedPlayers(): Player[] {
    return this.state.players.filter(p => p.connected);
  }

  private resetRoom() {
    this.stopTimer();
    this.state.players = [];
    this.state.status = 'lobby';
    this.state.roundNumber = 0;
    this.state.totalRounds = 0;
    this.state.showingRoundSummary = false;
    this.state.wordRevealed = false;
    this.state.currentWord = null;
    this.state.revealedWord = null;
    this.state.roundWords = [];
    this.state.roundEndsAt = null;
    this.nextGamePlayers = [];
    this.connToPlayer.clear();
  }

  private handleStart(
    conn: Party.Connection,
    category: Category,
    customWords?: string[],
    deckName?: string
  ) {
    // Check if starting from "play again" lobby or regular lobby
    const isPlayAgainLobby = this.nextGamePlayers.length > 0;
    const pool = isPlayAgainLobby ? this.nextGamePlayers : this.state.players;
    const connectedPool = pool.filter(p => p.connected);

    const player = this.playerFor(conn);
    const poolEntry = player && pool.find(p => p.id === player.id);
    if (!poolEntry?.isHost) {
      this.sendToConnection(conn, {
        type: 'error',
        message: 'Only the host can start the game'
      });
      return;
    }

    if (connectedPool.length < 2) {
      this.sendToConnection(conn, {
        type: 'error',
        message: 'Need at least 2 connected players to start'
      });
      return;
    }

    // Pick the word list: explicit custom list wins over the built-in category.
    let words: string[];
    let label: string;
    if (customWords && customWords.length > 0) {
      const cleaned = sanitizeCustomWords(customWords);
      if (cleaned.length < MIN_WORDS_PER_DECK) {
        this.sendToConnection(conn, {
          type: 'error',
          message: `Custom deck needs at least ${MIN_WORDS_PER_DECK} usable words (got ${cleaned.length})`
        });
        return;
      }
      if (cleaned.length > MAX_WORDS_PER_DECK) {
        this.sendToConnection(conn, {
          type: 'error',
          message: `Custom deck exceeds the ${MAX_WORDS_PER_DECK}-word limit`
        });
        return;
      }
      words = shuffle(cleaned);
      label = (deckName ?? '').trim().slice(0, MAX_DECK_NAME_LENGTH) || 'Custom';
    } else {
      words = getShuffledWords(category);
      label = category;
    }

    // Promote the connected pool into the active game; drop disconnected stragglers.
    this.state.players = connectedPool.map(p => ({ ...p, score: 0 }));

    // Always clear next game lobby when starting
    this.nextGamePlayers = [];

    // Initialize game
    this.state.status = 'playing';
    this.state.category = label;
    this.state.wordsRemaining = words;
    this.state.wordsUsed = [];
    this.state.currentGuesserIndex = 0;
    this.state.roundNumber = 1;
    this.state.totalRounds = this.state.players.length;

    // Start first round
    this.startRound();
  }

  private startRound() {
    this.state.roundEndsAt = Date.now() + ROUND_DURATION * 1000;
    this.state.wordRevealed = false;
    this.state.lastWordResult = null;
    this.state.revealedWord = null;
    this.state.roundWords = [];
    this.state.showingRoundSummary = false;
    this.nextWord();
    this.startTimer();
    this.broadcastState();
  }

  private nextWord() {
    this.advanceToNextWord();
    this.broadcastWord();
  }

  private advanceToNextWord() {
    if (this.state.wordsRemaining.length === 0) {
      // Reshuffle used words if we run out
      this.state.wordsRemaining = [...this.state.wordsUsed];
      this.state.wordsUsed = [];
      // Shuffle
      for (let i = this.state.wordsRemaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.state.wordsRemaining[i], this.state.wordsRemaining[j]] =
          [this.state.wordsRemaining[j], this.state.wordsRemaining[i]];
      }
    }

    this.state.currentWord = this.state.wordsRemaining.pop() || null;
  }

  private handleCorrect(conn: Party.Connection) {
    const guesser = this.state.players[this.state.currentGuesserIndex];
    if (!guesser) return;
    if (this.state.status !== 'playing') return;
    if (this.state.wordRevealed) return;
    if (this.state.showingRoundSummary) return;

    const player = this.playerFor(conn);
    if (!player) return;
    // Only non-guessers can mark correct
    if (player.id === guesser.id) return;

    // Increment score
    guesser.score++;

    // Track word for round summary
    if (this.state.currentWord) {
      this.state.roundWords.push({ word: this.state.currentWord, result: 'correct' });
      this.state.wordsUsed.push(this.state.currentWord);
    }

    // Store revealed word and advance to next
    this.state.revealedWord = this.state.currentWord;
    this.state.wordRevealed = true;
    this.state.lastWordResult = 'correct';

    this.advanceToNextWord();

    this.broadcastState();
    this.broadcastWordsForReveal();
  }

  private handlePass(conn: Party.Connection) {
    const guesser = this.state.players[this.state.currentGuesserIndex];
    if (!guesser) return;
    if (this.state.status !== 'playing') return;
    if (this.state.wordRevealed) return;
    if (this.state.showingRoundSummary) return;

    const player = this.playerFor(conn);
    if (!player) return;
    // Only guesser can pass
    if (player.id !== guesser.id) return;

    // Track word for round summary
    if (this.state.currentWord) {
      this.state.roundWords.push({ word: this.state.currentWord, result: 'pass' });
    }

    // Store revealed word and advance to next
    this.state.revealedWord = this.state.currentWord;
    this.state.wordRevealed = true;
    this.state.lastWordResult = 'pass';

    this.advanceToNextWord();

    this.broadcastState();
    this.broadcastWordsForReveal();
  }

  private handleNextWord(conn: Party.Connection) {
    const guesser = this.state.players[this.state.currentGuesserIndex];
    if (!guesser) return;
    if (this.state.status !== 'playing') return;
    if (!this.state.wordRevealed) return;

    const player = this.playerFor(conn);
    if (!player) return;
    // Only guesser can go to next word
    if (player.id !== guesser.id) return;

    // Clear reveal state - word already advanced
    this.state.wordRevealed = false;
    this.state.lastWordResult = null;
    this.state.revealedWord = null;
    this.broadcastState();
  }

  private handleStartNextRound(conn: Party.Connection) {
    if (this.state.status !== 'playing') return;
    if (!this.state.showingRoundSummary) return;

    // Only the next guesser can start the round
    const nextGuesser = this.state.players[this.state.nextGuesserIndex];
    const player = this.playerFor(conn);
    if (!nextGuesser || !player || player.id !== nextGuesser.id) return;

    // Move to next guesser
    this.state.currentGuesserIndex = this.state.nextGuesserIndex;
    this.state.roundNumber++;

    // Check if game is over
    if (this.state.roundNumber > this.state.totalRounds) {
      this.endGame();
      return;
    }

    // Start new round
    this.startRound();
  }

  private handleSkipTurn(conn: Party.Connection) {
    if (this.state.status !== 'playing') return;
    if (!this.state.showingRoundSummary) return;

    // Only the next guesser can skip their turn
    const nextGuesser = this.state.players[this.state.nextGuesserIndex];
    const player = this.playerFor(conn);
    if (!nextGuesser || !player || player.id !== nextGuesser.id) return;

    // Skipping counts as using a round
    this.state.roundNumber++;

    // Check if all rounds are done (everyone played or skipped)
    if (this.state.roundNumber > this.state.totalRounds) {
      this.endGame();
      return;
    }

    // Advance to the next player
    this.state.nextGuesserIndex = (this.state.nextGuesserIndex + 1) % this.state.players.length;

    this.broadcastState();
  }

  private handlePlayAgain(conn: Party.Connection) {
    const player = this.playerFor(conn);
    if (!player) return;

    // Already in rematch lobby — just re-send lobby state (idempotent for reconnects)
    if (this.nextGamePlayers.find(p => p.id === player.id)) {
      this.sendLobbyState(conn);
      return;
    }

    // First player to click becomes rematch host
    const isFirstPlayer = this.nextGamePlayers.length === 0;

    this.nextGamePlayers.push({
      id: player.id,
      name: player.name,
      isHost: isFirstPlayer,
      score: 0,
      connected: true
    });

    // Send rematch lobby state to this player
    this.sendLobbyState(conn);

    // Broadcast updated lobby to all rematch players
    this.broadcastLobbyToNextGamePlayers();
  }

  private startTimer() {
    // roundEndsAt was set by startRound(); arm a Durable Object alarm for it.
    // The DO can hibernate until the alarm fires instead of ticking each second.
    if (this.state.roundEndsAt !== null) {
      // Fire-and-forget; the storage API is async but we don't need to await.
      void this.room.storage.setAlarm(this.state.roundEndsAt);
    }
  }

  private stopTimer() {
    void this.room.storage.deleteAlarm();
  }

  private endRound() {
    this.stopTimer();

    // Add current word as timeout if there was one being shown
    if (this.state.currentWord && !this.state.wordRevealed) {
      this.state.roundWords.push({ word: this.state.currentWord, result: 'timeout' });
    }

    // Calculate who is next
    this.state.nextGuesserIndex = (this.state.currentGuesserIndex + 1) % this.state.players.length;
    this.state.showingRoundSummary = true;
    this.state.wordRevealed = false;
    this.state.currentWord = null;
    this.state.roundEndsAt = null;

    // If that was the final round, end the game so rematch/rejoin isn't blocked
    if (this.state.roundNumber >= this.state.totalRounds) {
      this.endGame();
      return;
    }

    this.broadcastState();
  }

  private endGame() {
    this.stopTimer();
    this.state.status = 'finished';
    this.state.currentWord = null;
    this.state.roundEndsAt = null;

    // Broadcast game end with final scores
    this.room.broadcast(JSON.stringify({
      type: 'gameEnd',
      players: [...this.state.players].sort((a, b) => b.score - a.score)
    }));

    this.broadcastState();
  }

  private getPublicState() {
    // Return state without the current word (word is sent separately)
    return {
      code: this.state.code,
      players: this.state.players,
      status: this.state.status,
      currentGuesserIndex: this.state.currentGuesserIndex,
      currentWord: null, // Never send word in state
      wordsRemaining: this.state.wordsRemaining.length,
      roundEndsAt: this.state.roundEndsAt,
      category: this.state.category,
      roundNumber: this.state.roundNumber,
      totalRounds: this.state.totalRounds,
      wordRevealed: this.state.wordRevealed,
      lastWordResult: this.state.lastWordResult,
      roundWords: this.state.roundWords,
      showingRoundSummary: this.state.showingRoundSummary,
      nextGuesserIndex: this.state.nextGuesserIndex
    };
  }

  private broadcastState() {
    // Send state to all connections, stamping each with its own playerId (if joined).
    for (const conn of this.room.getConnections()) {
      this.sendToConnection(conn, {
        type: 'state',
        state: this.getPublicState(),
        playerId: this.connToPlayer.get(conn.id) ?? null
      });
    }
  }

  private broadcastWord() {
    // Send word only to non-guessers
    const guesserId = this.state.players[this.state.currentGuesserIndex]?.id;

    for (const conn of this.room.getConnections()) {
      const pid = this.connToPlayer.get(conn.id);
      if (pid !== guesserId) {
        this.sendToConnection(conn, {
          type: 'word',
          word: this.state.currentWord || ''
        });
      }
    }
  }

  private broadcastWordsForReveal() {
    // Send revealed word to guesser, next word to clue givers
    const guesserId = this.state.players[this.state.currentGuesserIndex]?.id;

    for (const conn of this.room.getConnections()) {
      const pid = this.connToPlayer.get(conn.id);
      if (pid === guesserId) {
        // Guesser sees the revealed word
        this.sendToConnection(conn, {
          type: 'word',
          word: this.state.revealedWord || ''
        });
      } else {
        // Clue givers see the next word
        this.sendToConnection(conn, {
          type: 'word',
          word: this.state.currentWord || ''
        });
      }
    }
  }

  private sendToConnection(conn: Party.Connection, data: unknown) {
    conn.send(JSON.stringify(data));
  }

  private getLobbyState() {
    return {
      code: this.state.code,
      players: this.nextGamePlayers,
      status: 'lobby' as const,
      currentGuesserIndex: 0,
      currentWord: null,
      wordsRemaining: 0,
      roundEndsAt: null,
      category: '',
      roundNumber: 0,
      totalRounds: 0,
      wordRevealed: false,
      lastWordResult: null,
      roundWords: [],
      showingRoundSummary: false,
      nextGuesserIndex: 0
    };
  }

  private sendLobbyState(conn: Party.Connection) {
    this.sendToConnection(conn, {
      type: 'state',
      state: this.getLobbyState(),
      playerId: this.connToPlayer.get(conn.id) ?? null
    });
  }

  private broadcastLobbyToNextGamePlayers() {
    for (const conn of this.room.getConnections()) {
      const pid = this.connToPlayer.get(conn.id);
      if (pid && this.nextGamePlayers.find(p => p.id === pid)) {
        this.sendLobbyState(conn);
      }
    }
  }
}

BrainwaveServer satisfies Party.Worker;

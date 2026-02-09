import type * as Party from "partykit/server";
import { getShuffledWords, type Category } from "./words";

const ROUND_DURATION = 60; // seconds
const LAST_CHANCE_DURATION = 3; // extra seconds after timer ends

interface Player {
  id: string;
  name: string;
  isHost: boolean;
  score: number;
}

interface GameState {
  code: string;
  players: Player[];
  status: 'lobby' | 'playing' | 'finished';
  currentGuesserIndex: number;
  currentWord: string | null;
  wordsRemaining: string[];
  wordsUsed: string[];
  roundTimeLeft: number;
  category: string;
  roundNumber: number;
  totalRounds: number;
  lastChanceMode: boolean;
}

type ClientMessage =
  | { type: 'join'; name: string }
  | { type: 'start'; category: Category }
  | { type: 'correct' }
  | { type: 'pass' }
  | { type: 'nextRound' }
  | { type: 'playAgain' };

export default class BrainwaveServer implements Party.Server {
  state: GameState;
  timerInterval: ReturnType<typeof setInterval> | null = null;

  constructor(readonly room: Party.Room) {
    this.state = {
      code: room.id.toUpperCase(),
      players: [],
      status: 'lobby',
      currentGuesserIndex: 0,
      currentWord: null,
      wordsRemaining: [],
      wordsUsed: [],
      roundTimeLeft: ROUND_DURATION,
      category: '',
      roundNumber: 0,
      totalRounds: 0,
      lastChanceMode: false
    };
  }

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    // Send current state to new connection
    this.sendToConnection(conn, {
      type: 'state',
      state: this.getPublicState(),
      playerId: conn.id
    });
  }

  onMessage(message: string, sender: Party.Connection) {
    try {
      const msg = JSON.parse(message) as ClientMessage;

      switch (msg.type) {
        case 'join':
          this.handleJoin(sender, msg.name);
          break;
        case 'start':
          this.handleStart(sender, msg.category);
          break;
        case 'correct':
          this.handleCorrect(sender);
          break;
        case 'pass':
          this.handlePass(sender);
          break;
        case 'nextRound':
          this.handleNextRound(sender);
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
    this.handleLeave(conn);
  }

  private handleJoin(conn: Party.Connection, name: string) {
    // Check if player already exists
    const existingPlayer = this.state.players.find(p => p.id === conn.id);
    if (existingPlayer) {
      return;
    }

    // Check if game is already in progress
    if (this.state.status === 'playing') {
      this.sendToConnection(conn, {
        type: 'error',
        message: 'Game already in progress'
      });
      return;
    }

    // Create new player
    const player: Player = {
      id: conn.id,
      name: name.trim().slice(0, 20),
      isHost: this.state.players.length === 0,
      score: 0
    };

    this.state.players.push(player);
    this.broadcastState();
  }

  private handleLeave(conn: Party.Connection) {
    const playerIndex = this.state.players.findIndex(p => p.id === conn.id);
    if (playerIndex === -1) return;

    const wasHost = this.state.players[playerIndex].isHost;
    const wasGuesser = playerIndex === this.state.currentGuesserIndex;

    // Remove player
    this.state.players.splice(playerIndex, 1);

    // If no players left, reset game
    if (this.state.players.length === 0) {
      this.stopTimer();
      this.state.status = 'lobby';
      return;
    }

    // Transfer host if needed
    if (wasHost && this.state.players.length > 0) {
      this.state.players[0].isHost = true;
    }

    // Adjust guesser index if needed
    if (this.state.status === 'playing') {
      if (wasGuesser || this.state.currentGuesserIndex >= this.state.players.length) {
        this.state.currentGuesserIndex = this.state.currentGuesserIndex % this.state.players.length;
        this.nextWord();
      }
    }

    this.broadcastState();
  }

  private handleStart(conn: Party.Connection, category: Category) {
    const player = this.state.players.find(p => p.id === conn.id);
    if (!player?.isHost) {
      this.sendToConnection(conn, {
        type: 'error',
        message: 'Only the host can start the game'
      });
      return;
    }

    if (this.state.players.length < 2) {
      this.sendToConnection(conn, {
        type: 'error',
        message: 'Need at least 2 players to start'
      });
      return;
    }

    // Initialize game
    this.state.status = 'playing';
    this.state.category = category;
    this.state.wordsRemaining = getShuffledWords(category);
    this.state.wordsUsed = [];
    this.state.currentGuesserIndex = 0;
    this.state.roundNumber = 1;
    this.state.totalRounds = this.state.players.length;
    this.state.lastChanceMode = false;

    // Reset scores
    this.state.players.forEach(p => p.score = 0);

    // Start first round
    this.startRound();
  }

  private startRound() {
    this.state.roundTimeLeft = ROUND_DURATION;
    this.state.lastChanceMode = false;
    this.nextWord();
    this.startTimer();
    this.broadcastState();
  }

  private nextWord() {
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
    this.broadcastWord();
  }

  private handleCorrect(conn: Party.Connection) {
    const guesser = this.state.players[this.state.currentGuesserIndex];
    if (!guesser || conn.id !== guesser.id) return;
    if (this.state.status !== 'playing') return;

    // Add to used words
    if (this.state.currentWord) {
      this.state.wordsUsed.push(this.state.currentWord);
    }

    // Increment score
    guesser.score++;

    // Next word
    this.nextWord();
    this.broadcastState();
  }

  private handlePass(conn: Party.Connection) {
    const guesser = this.state.players[this.state.currentGuesserIndex];
    if (!guesser || conn.id !== guesser.id) return;
    if (this.state.status !== 'playing') return;

    // Put word back at beginning of remaining (will be used later)
    if (this.state.currentWord) {
      this.state.wordsRemaining.unshift(this.state.currentWord);
    }

    // Next word
    this.nextWord();
    this.broadcastState();
  }

  private handleNextRound(conn: Party.Connection) {
    const player = this.state.players.find(p => p.id === conn.id);
    if (!player?.isHost) return;
    if (this.state.status !== 'playing') return;

    // Move to next guesser
    this.state.currentGuesserIndex = (this.state.currentGuesserIndex + 1) % this.state.players.length;
    this.state.roundNumber++;

    // Check if game is over
    if (this.state.roundNumber > this.state.totalRounds) {
      this.endGame();
      return;
    }

    // Start new round
    this.startRound();
  }

  private handlePlayAgain(conn: Party.Connection) {
    const player = this.state.players.find(p => p.id === conn.id);
    if (!player?.isHost) return;

    // Reset to lobby
    this.state.status = 'lobby';
    this.state.currentWord = null;
    this.state.wordsRemaining = [];
    this.state.wordsUsed = [];
    this.state.roundNumber = 0;
    this.state.players.forEach(p => p.score = 0);

    this.broadcastState();
  }

  private startTimer() {
    this.stopTimer();

    this.timerInterval = setInterval(() => {
      this.state.roundTimeLeft--;

      if (this.state.roundTimeLeft <= 0 && !this.state.lastChanceMode) {
        // Enter last chance mode
        this.state.lastChanceMode = true;
        this.state.roundTimeLeft = LAST_CHANCE_DURATION;
        this.broadcastState();
      } else if (this.state.roundTimeLeft <= 0 && this.state.lastChanceMode) {
        // Round over
        this.endRound();
      } else {
        this.broadcastState();
      }
    }, 1000);
  }

  private stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private endRound() {
    this.stopTimer();

    const guesser = this.state.players[this.state.currentGuesserIndex];

    // Broadcast round end
    this.room.broadcast(JSON.stringify({
      type: 'roundEnd',
      guesserId: guesser?.id,
      score: guesser?.score || 0
    }));
  }

  private endGame() {
    this.stopTimer();
    this.state.status = 'finished';
    this.state.currentWord = null;

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
      roundTimeLeft: this.state.roundTimeLeft,
      category: this.state.category,
      roundNumber: this.state.roundNumber,
      totalRounds: this.state.totalRounds,
      lastChanceMode: this.state.lastChanceMode
    };
  }

  private broadcastState() {
    // Send state to all connections
    for (const conn of this.room.getConnections()) {
      this.sendToConnection(conn, {
        type: 'state',
        state: this.getPublicState(),
        playerId: conn.id
      });
    }
  }

  private broadcastWord() {
    // Send word only to non-guessers
    const guesserId = this.state.players[this.state.currentGuesserIndex]?.id;

    for (const conn of this.room.getConnections()) {
      if (conn.id !== guesserId) {
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
}

BrainwaveServer satisfies Party.Worker;

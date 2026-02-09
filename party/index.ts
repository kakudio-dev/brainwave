import type * as Party from "partykit/server";
import { getShuffledWords, type Category } from "./words";

const ROUND_DURATION = 10; // seconds

interface Player {
  id: string;
  name: string;
  isHost: boolean;
  score: number;
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
  roundTimeLeft: number;
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
  | { type: 'join'; name: string }
  | { type: 'start'; category: Category }
  | { type: 'correct' }
  | { type: 'pass' }
  | { type: 'nextWord' }
  | { type: 'startNextRound' }
  | { type: 'skipTurn' }
  | { type: 'playAgain' };

export default class BrainwaveServer implements Party.Server {
  state: GameState;
  timerInterval: ReturnType<typeof setInterval> | null = null;
  nextGamePlayers: Player[] = []; // Players waiting in lobby for next game

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
      roundTimeLeft: ROUND_DURATION,
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

    // Also remove from next game lobby if present
    const nextGameIndex = this.nextGamePlayers.findIndex(p => p.id === conn.id);
    if (nextGameIndex !== -1) {
      const wasNextGameHost = this.nextGamePlayers[nextGameIndex].isHost;
      this.nextGamePlayers.splice(nextGameIndex, 1);

      // Transfer host in next game lobby if needed
      if (wasNextGameHost && this.nextGamePlayers.length > 0) {
        this.nextGamePlayers[0].isHost = true;
      }

      // Broadcast updated lobby to remaining players
      this.broadcastLobbyToNextGamePlayers();
    }

    // If no players left, reset game
    if (this.state.players.length === 0) {
      this.stopTimer();
      this.state.status = 'lobby';
      this.nextGamePlayers = []; // Clear next game lobby too
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
    // Check if starting from "play again" lobby or regular lobby
    const isPlayAgainLobby = this.nextGamePlayers.length > 0;
    const players = isPlayAgainLobby ? this.nextGamePlayers : this.state.players;

    const player = players.find(p => p.id === conn.id);
    if (!player?.isHost) {
      this.sendToConnection(conn, {
        type: 'error',
        message: 'Only the host can start the game'
      });
      return;
    }

    if (players.length < 2) {
      this.sendToConnection(conn, {
        type: 'error',
        message: 'Need at least 2 players to start'
      });
      return;
    }

    // If play again, transfer players to main state
    if (isPlayAgainLobby) {
      this.state.players = [...this.nextGamePlayers];
    }

    // Always clear next game lobby when starting
    this.nextGamePlayers = [];

    // Initialize game
    this.state.status = 'playing';
    this.state.category = category;
    this.state.wordsRemaining = getShuffledWords(category);
    this.state.wordsUsed = [];
    this.state.currentGuesserIndex = 0;
    this.state.roundNumber = 1;
    this.state.totalRounds = this.state.players.length;

    // Reset scores
    this.state.players.forEach(p => p.score = 0);

    // Start first round
    this.startRound();
  }

  private startRound() {
    this.state.roundTimeLeft = ROUND_DURATION;
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

    // Only non-guessers can mark correct
    if (conn.id === guesser.id) return;

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

    // Only guesser can pass
    if (conn.id !== guesser.id) return;

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

    // Only guesser can go to next word
    if (conn.id !== guesser.id) return;

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
    if (!nextGuesser || conn.id !== nextGuesser.id) return;

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
    if (!nextGuesser || conn.id !== nextGuesser.id) return;

    // Skipping counts as using a round
    this.state.roundNumber++;

    // Check if all rounds are done (everyone played or skipped)
    if (this.state.roundNumber >= this.state.totalRounds) {
      // Game is over - UI will show Play Again/Leave buttons
      this.broadcastState();
      return;
    }

    // Advance to the next player
    this.state.nextGuesserIndex = (this.state.nextGuesserIndex + 1) % this.state.players.length;

    this.broadcastState();
  }

  private handlePlayAgain(conn: Party.Connection) {
    const player = this.state.players.find(p => p.id === conn.id);
    if (!player) return;

    // Check if already in next game lobby
    if (this.nextGamePlayers.find(p => p.id === conn.id)) return;

    // First player to click becomes host
    const isFirstPlayer = this.nextGamePlayers.length === 0;

    // Add to next game lobby
    this.nextGamePlayers.push({
      id: player.id,
      name: player.name,
      isHost: isFirstPlayer,
      score: 0
    });

    // Send lobby state to this player
    this.sendLobbyState(conn);

    // Broadcast updated lobby to all players in nextGamePlayers
    this.broadcastLobbyToNextGamePlayers();
  }

  private startTimer() {
    this.stopTimer();

    this.timerInterval = setInterval(() => {
      this.state.roundTimeLeft--;

      if (this.state.roundTimeLeft <= 0) {
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

    // Add current word as timeout if there was one being shown
    if (this.state.currentWord && !this.state.wordRevealed) {
      this.state.roundWords.push({ word: this.state.currentWord, result: 'timeout' });
    }

    // Calculate who is next
    this.state.nextGuesserIndex = (this.state.currentGuesserIndex + 1) % this.state.players.length;
    this.state.showingRoundSummary = true;
    this.state.wordRevealed = false;
    this.state.currentWord = null;

    this.broadcastState();
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
      wordRevealed: this.state.wordRevealed,
      lastWordResult: this.state.lastWordResult,
      roundWords: this.state.roundWords,
      showingRoundSummary: this.state.showingRoundSummary,
      nextGuesserIndex: this.state.nextGuesserIndex
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

  private broadcastWordToAll() {
    // Send word to everyone (when revealed)
    for (const conn of this.room.getConnections()) {
      this.sendToConnection(conn, {
        type: 'word',
        word: this.state.currentWord || ''
      });
    }
  }

  private broadcastWordsForReveal() {
    // Send revealed word to guesser, next word to clue givers
    const guesserId = this.state.players[this.state.currentGuesserIndex]?.id;

    for (const conn of this.room.getConnections()) {
      if (conn.id === guesserId) {
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
      roundTimeLeft: 0,
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
      playerId: conn.id
    });
  }

  private broadcastLobbyToNextGamePlayers() {
    for (const conn of this.room.getConnections()) {
      if (this.nextGamePlayers.find(p => p.id === conn.id)) {
        this.sendLobbyState(conn);
      }
    }
  }
}

BrainwaveServer satisfies Party.Worker;

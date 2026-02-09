import PartySocket from 'partysocket';
import {
  gameState,
  playerId,
  currentWord,
  connectionStatus,
  errorMessage,
  roundEndEvent,
  resetStores
} from '$lib/stores/game';
import type { ClientMessage, ServerMessage, GameState, Category } from '$lib/types';

// PartyKit host - use localhost in dev, deployed URL in production
const PARTYKIT_HOST = import.meta.env.DEV
  ? 'localhost:1998'
  : 'brainwave.username.partykit.dev'; // Update this after deploying

let socket: PartySocket | null = null;

export function connect(roomCode: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket) {
      socket.close();
    }

    resetStores();
    connectionStatus.set('connecting');

    socket = new PartySocket({
      host: PARTYKIT_HOST,
      room: roomCode.toLowerCase()
    });

    socket.addEventListener('open', () => {
      connectionStatus.set('connected');
      resolve();
    });

    socket.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        handleMessage(msg);
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    });

    socket.addEventListener('close', () => {
      connectionStatus.set('disconnected');
    });

    socket.addEventListener('error', () => {
      connectionStatus.set('error');
      errorMessage.set('Connection failed');
      reject(new Error('Connection failed'));
    });
  });
}

export function disconnect() {
  if (socket) {
    socket.close();
    socket = null;
  }
  resetStores();
}

function handleMessage(msg: ServerMessage) {
  switch (msg.type) {
    case 'state':
      gameState.set(msg.state as GameState);
      playerId.set(msg.playerId);
      break;

    case 'word':
      currentWord.set(msg.word);
      break;

    case 'error':
      errorMessage.set(msg.message);
      break;

    case 'roundEnd':
      roundEndEvent.set({ guesserId: msg.guesserId, score: msg.score });
      break;

    case 'gameEnd':
      // Game ended - scores are in msg.players
      break;
  }
}

function send(msg: ClientMessage) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

// Game actions
export function joinGame(name: string) {
  send({ type: 'join', name });
}

export function startGame(category: Category) {
  send({ type: 'start', category });
}

export function markCorrect() {
  send({ type: 'correct' });
}

export function markPass() {
  send({ type: 'pass' });
}

export function goToNextWord() {
  send({ type: 'nextWord' });
}

export function startNextRound() {
  send({ type: 'startNextRound' });
}

export function skipTurn() {
  send({ type: 'skipTurn' });
}

export function playAgain() {
  send({ type: 'playAgain' });
}

// Generate a random 4-letter room code
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Removed I and O to avoid confusion
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

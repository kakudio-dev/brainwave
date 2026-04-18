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

// PartyKit host - override for prod via VITE_PARTYKIT_HOST env var
const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST ?? 'localhost:1998';

const PLAYER_ID_KEY = 'brainwave-player-id';

let socket: PartySocket | null = null;
// Remember the most recent join so we can re-send it on auto-reconnect.
let pendingJoin: { name: string } | null = null;

function getOrCreatePlayerId(): string {
  if (typeof localStorage === 'undefined') {
    return crypto.randomUUID();
  }
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

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

    let resolved = false;

    // 'open' fires on initial connect AND on every auto-reconnect. On reconnect
    // we must re-send our join message so the server re-binds this connection
    // to our stable playerId.
    socket.addEventListener('open', () => {
      connectionStatus.set('connected');
      if (pendingJoin) {
        socket!.send(JSON.stringify({
          type: 'join',
          name: pendingJoin.name,
          playerId: getOrCreatePlayerId()
        } satisfies ClientMessage));
      }
      if (!resolved) {
        resolved = true;
        resolve();
      }
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
      // PartySocket auto-reconnects; surface the gap as 'connecting'.
      connectionStatus.set('connecting');
    });

    socket.addEventListener('error', () => {
      connectionStatus.set('error');
      errorMessage.set('Connection failed');
      if (!resolved) {
        resolved = true;
        reject(new Error('Connection failed'));
      }
    });
  });
}

export function disconnect() {
  pendingJoin = null;
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
      if (msg.playerId) playerId.set(msg.playerId);
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
  // Remember so auto-reconnects re-send it.
  pendingJoin = { name };
  send({ type: 'join', name, playerId: getOrCreatePlayerId() });
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

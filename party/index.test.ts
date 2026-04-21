import { describe, it, expect, beforeEach, vi } from 'vitest';
import BrainwaveServer from './index';
import type * as Party from 'partykit/server';

// Mock word list for deterministic tests
vi.mock('./words', () => ({
	getShuffledWords: () => ['Word1', 'Word2', 'Word3', 'Word4', 'Word5']
}));

// --- Mock Factories ---

interface MockConnection {
	id: string;
	messages: unknown[];
	send: (data: string) => void;
}

function createMockConnection(id: string): MockConnection & Party.Connection {
	const conn: MockConnection = {
		id,
		messages: [],
		send(data: string) {
			this.messages.push(JSON.parse(data));
		}
	};
	return conn as MockConnection & Party.Connection;
}

interface MockStorage {
	alarm: number | null;
	setAlarm: (t: number) => Promise<void>;
	getAlarm: () => Promise<number | null>;
	deleteAlarm: () => Promise<void>;
}

interface MockRoom {
	id: string;
	connections: Map<string, MockConnection & Party.Connection>;
	broadcasts: unknown[];
	storage: MockStorage;
	getConnections: () => IterableIterator<Party.Connection>;
	broadcast: (data: string) => void;
}

function createMockRoom(id = 'TEST'): MockRoom & Party.Room {
	const storage: MockStorage = {
		alarm: null,
		async setAlarm(t: number) { this.alarm = t; },
		async getAlarm() { return this.alarm; },
		async deleteAlarm() { this.alarm = null; }
	};
	const room: MockRoom = {
		id,
		connections: new Map(),
		broadcasts: [],
		storage,
		getConnections() {
			return this.connections.values();
		},
		broadcast(data: string) {
			this.broadcasts.push(JSON.parse(data));
			for (const conn of this.connections.values()) {
				conn.send(data);
			}
		}
	};
	return room as MockRoom & Party.Room;
}

// Fire the room's alarm on the server, simulating the Durable Object waking
// up at the scheduled deadline.
async function fireAlarm(room: MockRoom, server: BrainwaveServer) {
	room.storage.alarm = null;
	await server.onAlarm();
}

// --- Test Helpers ---

function getLastState(conn: MockConnection): { state: { players: { id: string; name: string; isHost: boolean; score: number }[]; status: string; currentGuesserIndex: number; roundNumber: number; totalRounds: number; showingRoundSummary: boolean; wordRevealed: boolean; lastWordResult: string | null; roundWords: { word: string; result: string }[]; nextGuesserIndex: number }; playerId: string } | undefined {
	const stateMessages = conn.messages.filter((m: any) => m.type === 'state');
	return stateMessages[stateMessages.length - 1] as any;
}

function getLastWord(conn: MockConnection): string | undefined {
	const wordMessages = conn.messages.filter((m: any) => m.type === 'word');
	const last = wordMessages[wordMessages.length - 1] as any;
	return last?.word;
}

function getLastError(conn: MockConnection): string | undefined {
	const errorMessages = conn.messages.filter((m: any) => m.type === 'error');
	const last = errorMessages[errorMessages.length - 1] as any;
	return last?.message;
}

function sendMessage(server: BrainwaveServer, conn: Party.Connection, msg: unknown) {
	server.onMessage(JSON.stringify(msg), conn);
}

// Convenience: in tests, a player's stable playerId defaults to their conn.id.
function joinAs(server: BrainwaveServer, conn: Party.Connection, name: string, playerId = conn.id) {
	sendMessage(server, conn, { type: 'join', name, playerId });
}

function addConnection(room: MockRoom, conn: MockConnection & Party.Connection) {
	room.connections.set(conn.id, conn);
}

// --- Tests ---

describe('BrainwaveServer', () => {
	let room: MockRoom & Party.Room;
	let server: BrainwaveServer;

	beforeEach(() => {
		vi.useFakeTimers();
		room = createMockRoom();
		server = new BrainwaveServer(room);
	});

	describe('Player Management', () => {
		it('A player can join a game lobby', () => {
			const conn = createMockConnection('player1');
			addConnection(room, conn);
			server.onConnect(conn, {} as Party.ConnectionContext);

			joinAs(server, conn, 'Alice');

			const state = getLastState(conn);
			expect(state?.state.players).toHaveLength(1);
			expect(state?.state.players[0].name).toBe('Alice');
			expect(state?.state.status).toBe('lobby');
		});

		it('A late-joiner can enter a game in progress as a clue-giver', () => {
			// Setup: Two players join and start game
			const conn1 = createMockConnection('player1');
			const conn2 = createMockConnection('player2');
			addConnection(room, conn1);
			addConnection(room, conn2);
			server.onConnect(conn1, {} as Party.ConnectionContext);
			server.onConnect(conn2, {} as Party.ConnectionContext);

			joinAs(server, conn1, 'Alice');
			joinAs(server, conn2, 'Bob');
			sendMessage(server, conn1, { type: 'start', category: 'movies' });

			const beforeState = getLastState(conn1);
			expect(beforeState?.state.totalRounds).toBe(2);

			// New player joins mid-game
			const conn3 = createMockConnection('player3');
			addConnection(room, conn3);
			server.onConnect(conn3, {} as Party.ConnectionContext);
			joinAs(server, conn3, 'Charlie');

			expect(getLastError(conn3)).toBeUndefined();

			const afterState = getLastState(conn1);
			expect(afterState?.state.players).toHaveLength(3);
			// totalRounds stays at 2 — Charlie doesn't get a turn this game.
			expect(afterState?.state.totalRounds).toBe(2);
			const charlie = afterState?.state.players.find(p => p.name === 'Charlie');
			expect(charlie?.isHost).toBe(false);
			expect(charlie?.connected).toBe(true);
		});

		it('First player to join becomes the host', () => {
			const conn1 = createMockConnection('player1');
			const conn2 = createMockConnection('player2');
			addConnection(room, conn1);
			addConnection(room, conn2);
			server.onConnect(conn1, {} as Party.ConnectionContext);
			server.onConnect(conn2, {} as Party.ConnectionContext);

			joinAs(server, conn1, 'Alice');
			joinAs(server, conn2, 'Bob');

			const state = getLastState(conn1);
			expect(state?.state.players[0].isHost).toBe(true);
			expect(state?.state.players[1].isHost).toBe(false);
		});

		it('A transient disconnect in the lobby preserves the host slot', () => {
			const conn1 = createMockConnection('player1');
			const conn2 = createMockConnection('player2');
			addConnection(room, conn1);
			addConnection(room, conn2);
			server.onConnect(conn1, {} as Party.ConnectionContext);
			server.onConnect(conn2, {} as Party.ConnectionContext);

			joinAs(server, conn1, 'Alice');
			joinAs(server, conn2, 'Bob');

			// Host's socket blips offline (phone sleep, wifi hiccup, Cloudflare
			// recycling idle WS). Their seat should stay put; otherwise a brief
			// network glitch silently demotes them when they reconnect.
			room.connections.delete('player1');
			server.onClose(conn1);

			const state = getLastState(conn2);
			expect(state?.state.players).toHaveLength(2);
			const alice = state?.state.players.find(p => p.name === 'Alice');
			expect(alice?.connected).toBe(false);
			expect(alice?.isHost).toBe(true);
		});

		it('An explicit leave removes the host and promotes the next player', () => {
			const conn1 = createMockConnection('player1');
			const conn2 = createMockConnection('player2');
			addConnection(room, conn1);
			addConnection(room, conn2);
			server.onConnect(conn1, {} as Party.ConnectionContext);
			server.onConnect(conn2, {} as Party.ConnectionContext);

			joinAs(server, conn1, 'Alice');
			joinAs(server, conn2, 'Bob');

			// Host explicitly clicks "Leave Game" before the socket closes.
			sendMessage(server, conn1, { type: 'leave' });
			room.connections.delete('player1');
			server.onClose(conn1);

			const state = getLastState(conn2);
			expect(state?.state.players).toHaveLength(1);
			expect(state?.state.players[0].name).toBe('Bob');
			expect(state?.state.players[0].isHost).toBe(true);
		});

		it('State broadcasts include serverNow for client clock sync', () => {
			const conn = createMockConnection('player1');
			addConnection(room, conn);
			server.onConnect(conn, {} as Party.ConnectionContext);
			joinAs(server, conn, 'Alice');

			const last = conn.messages.filter((m: { type: string }) => m.type === 'state').at(-1) as
				| { serverNow?: number }
				| undefined;
			expect(last?.serverNow).toBeTypeOf('number');
		});

		it('When a player leaves mid-game, the game continues', () => {
			const conn1 = createMockConnection('player1');
			const conn2 = createMockConnection('player2');
			const conn3 = createMockConnection('player3');
			addConnection(room, conn1);
			addConnection(room, conn2);
			addConnection(room, conn3);
			server.onConnect(conn1, {} as Party.ConnectionContext);
			server.onConnect(conn2, {} as Party.ConnectionContext);
			server.onConnect(conn3, {} as Party.ConnectionContext);

			joinAs(server, conn1, 'Alice');
			joinAs(server, conn2, 'Bob');
			joinAs(server, conn3, 'Charlie');
			sendMessage(server, conn1, { type: 'start', category: 'movies' });

			// Non-guesser disconnects (keeps slot so they can reconnect)
			room.connections.delete('player3');
			server.onClose(conn3);

			const state = getLastState(conn1);
			expect(state?.state.status).toBe('playing');
			expect(state?.state.players).toHaveLength(3);
			const charlie = state?.state.players.find(p => p.name === 'Charlie');
			expect(charlie?.connected).toBe(false);
		});

		it('A disconnected player can refresh and resume mid-game without losing their turn', () => {
			const conn1 = createMockConnection('player1');
			const conn2 = createMockConnection('player2');
			addConnection(room, conn1);
			addConnection(room, conn2);
			server.onConnect(conn1, {} as Party.ConnectionContext);
			server.onConnect(conn2, {} as Party.ConnectionContext);
			joinAs(server, conn1, 'Alice');
			joinAs(server, conn2, 'Bob');
			sendMessage(server, conn1, { type: 'start', category: 'movies' });

			// Alice (the current guesser, index 0) refreshes her browser
			room.connections.delete('player1');
			server.onClose(conn1);
			const reconn = createMockConnection('player1-new');
			addConnection(room, reconn);
			server.onConnect(reconn, {} as Party.ConnectionContext);
			joinAs(server, reconn, 'Alice', 'player1'); // same playerId from localStorage

			expect(getLastError(reconn)).toBeUndefined();
			const state = getLastState(reconn);
			expect(state?.state.status).toBe('playing');
			expect(state?.state.players).toHaveLength(2);
			// Turn order preserved: Alice still at index 0 and is still the guesser.
			expect(state?.state.currentGuesserIndex).toBe(0);
			const alice = state?.state.players[0];
			expect(alice?.name).toBe('Alice');
			expect(alice?.connected).toBe(true);
		});
	});

	describe('Starting a Game', () => {
		it('Only the host can start the game', () => {
			const conn1 = createMockConnection('player1');
			const conn2 = createMockConnection('player2');
			addConnection(room, conn1);
			addConnection(room, conn2);
			server.onConnect(conn1, {} as Party.ConnectionContext);
			server.onConnect(conn2, {} as Party.ConnectionContext);

			joinAs(server, conn1, 'Alice');
			joinAs(server, conn2, 'Bob');

			// Non-host tries to start
			sendMessage(server, conn2, { type: 'start', category: 'movies' });

			const error = getLastError(conn2);
			expect(error).toBe('Only the host can start the game');
		});

		it('Game requires at least 2 players to start', () => {
			const conn1 = createMockConnection('player1');
			addConnection(room, conn1);
			server.onConnect(conn1, {} as Party.ConnectionContext);

			joinAs(server, conn1, 'Alice');
			sendMessage(server, conn1, { type: 'start', category: 'movies' });

			const error = getLastError(conn1);
			expect(error).toBe('Need at least 2 connected players to start');
		});

		it('Starting a game initializes rounds equal to player count', () => {
			const conn1 = createMockConnection('player1');
			const conn2 = createMockConnection('player2');
			const conn3 = createMockConnection('player3');
			addConnection(room, conn1);
			addConnection(room, conn2);
			addConnection(room, conn3);
			server.onConnect(conn1, {} as Party.ConnectionContext);
			server.onConnect(conn2, {} as Party.ConnectionContext);
			server.onConnect(conn3, {} as Party.ConnectionContext);

			joinAs(server, conn1, 'Alice');
			joinAs(server, conn2, 'Bob');
			joinAs(server, conn3, 'Charlie');
			sendMessage(server, conn1, { type: 'start', category: 'movies' });

			const state = getLastState(conn1);
			expect(state?.state.totalRounds).toBe(3);
			expect(state?.state.roundNumber).toBe(1);
		});
	});

	describe('Guessing Flow', () => {
		let conn1: MockConnection & Party.Connection;
		let conn2: MockConnection & Party.Connection;

		beforeEach(() => {
			conn1 = createMockConnection('player1');
			conn2 = createMockConnection('player2');
			addConnection(room, conn1);
			addConnection(room, conn2);
			server.onConnect(conn1, {} as Party.ConnectionContext);
			server.onConnect(conn2, {} as Party.ConnectionContext);

			joinAs(server, conn1, 'Alice');
			joinAs(server, conn2, 'Bob');
			sendMessage(server, conn1, { type: 'start', category: 'movies' });
		});

		it('Guesser does not see the current word', () => {
			// player1 is the guesser (index 0)
			const guesserWord = getLastWord(conn1);
			expect(guesserWord).toBeUndefined();
		});

		it('Clue givers see the current word', () => {
			// player2 is a clue giver
			const clueGiverWord = getLastWord(conn2);
			expect(clueGiverWord).toBe('Word5'); // Last word from mocked list
		});

		it('Only clue givers can mark a word as correct', () => {
			// Guesser tries to mark correct - should be ignored
			const stateBefore = getLastState(conn1);
			const scoreBefore = stateBefore?.state.players[0].score;

			sendMessage(server, conn1, { type: 'correct' });

			const stateAfter = getLastState(conn1);
			expect(stateAfter?.state.players[0].score).toBe(scoreBefore);

			// Clue giver marks correct - should work
			sendMessage(server, conn2, { type: 'correct' });

			const stateAfterCorrect = getLastState(conn1);
			expect(stateAfterCorrect?.state.players[0].score).toBe(1);
		});

		it('Only the guesser can pass on a word', () => {
			// Clue giver tries to pass - should be ignored
			sendMessage(server, conn2, { type: 'pass' });

			const stateAfterClueGiverPass = getLastState(conn1);
			expect(stateAfterClueGiverPass?.state.wordRevealed).toBe(false);

			// Guesser passes - should work
			sendMessage(server, conn1, { type: 'pass' });

			const stateAfterGuesserPass = getLastState(conn1);
			expect(stateAfterGuesserPass?.state.wordRevealed).toBe(true);
			expect(stateAfterGuesserPass?.state.lastWordResult).toBe('pass');
		});

		it('Marking correct increments guesser\'s score', () => {
			const stateBefore = getLastState(conn1);
			expect(stateBefore?.state.players[0].score).toBe(0);

			sendMessage(server, conn2, { type: 'correct' });

			const stateAfter = getLastState(conn1);
			expect(stateAfter?.state.players[0].score).toBe(1);
		});

		it('After correct/pass, word is revealed to guesser', () => {
			// Before correct, guesser doesn't have the word
			expect(getLastWord(conn1)).toBeUndefined();

			// Clue giver marks correct
			sendMessage(server, conn2, { type: 'correct' });

			// Now guesser should see the revealed word
			const guesserWord = getLastWord(conn1);
			expect(guesserWord).toBe('Word5');
		});
	});

	describe('Round Transitions', () => {
		let conn1: MockConnection & Party.Connection;
		let conn2: MockConnection & Party.Connection;

		beforeEach(() => {
			conn1 = createMockConnection('player1');
			conn2 = createMockConnection('player2');
			addConnection(room, conn1);
			addConnection(room, conn2);
			server.onConnect(conn1, {} as Party.ConnectionContext);
			server.onConnect(conn2, {} as Party.ConnectionContext);

			joinAs(server, conn1, 'Alice');
			joinAs(server, conn2, 'Bob');
			sendMessage(server, conn1, { type: 'start', category: 'movies' });
		});

		it('Round ends when alarm fires at the round deadline', async () => {
			await fireAlarm(room, server);

			const state = getLastState(conn1);
			expect(state?.state.showingRoundSummary).toBe(true);
		});

		it('Round summary shows all words with results', async () => {
			// Get a correct word
			sendMessage(server, conn2, { type: 'correct' });
			sendMessage(server, conn1, { type: 'nextWord' });

			// Pass on a word
			sendMessage(server, conn1, { type: 'pass' });
			sendMessage(server, conn1, { type: 'nextWord' });

			// Simulate round deadline hitting (timeout on current word)
			await fireAlarm(room, server);

			const state = getLastState(conn1);
			expect(state?.state.roundWords.length).toBeGreaterThanOrEqual(2);
			expect(state?.state.roundWords[0].result).toBe('correct');
			expect(state?.state.roundWords[1].result).toBe('pass');
		});

		it('Next guesser can start their turn from summary', async () => {
			await fireAlarm(room, server);

			const stateBefore = getLastState(conn1);
			expect(stateBefore?.state.showingRoundSummary).toBe(true);
			expect(stateBefore?.state.nextGuesserIndex).toBe(1); // Bob is next

			// Next guesser starts their turn
			sendMessage(server, conn2, { type: 'startNextRound' });

			const stateAfter = getLastState(conn1);
			expect(stateAfter?.state.showingRoundSummary).toBe(false);
			expect(stateAfter?.state.currentGuesserIndex).toBe(1);
			expect(stateAfter?.state.roundNumber).toBe(2);
		});

		it('Next guesser can skip their turn', async () => {
			await fireAlarm(room, server);

			const stateBefore = getLastState(conn1);
			expect(stateBefore?.state.roundNumber).toBe(1);

			// Next guesser skips
			sendMessage(server, conn2, { type: 'skipTurn' });

			const stateAfter = getLastState(conn1);
			expect(stateAfter?.state.roundNumber).toBe(2);
		});

		it('Starting a round sets a Durable Object alarm at the deadline', () => {
			const stateBefore = getLastState(conn1);
			const endsAt = stateBefore?.state.roundEndsAt;
			expect(endsAt).toBeTypeOf('number');
			expect(room.storage.alarm).toBe(endsAt);
		});
	});

	describe('Play Again Flow', () => {
		let conn1: MockConnection & Party.Connection;
		let conn2: MockConnection & Party.Connection;

		beforeEach(async () => {
			conn1 = createMockConnection('player1');
			conn2 = createMockConnection('player2');
			addConnection(room, conn1);
			addConnection(room, conn2);
			server.onConnect(conn1, {} as Party.ConnectionContext);
			server.onConnect(conn2, {} as Party.ConnectionContext);

			joinAs(server, conn1, 'Alice');
			joinAs(server, conn2, 'Bob');
			sendMessage(server, conn1, { type: 'start', category: 'movies' });

			// Fire alarm for round 1, start round 2, then fire alarm for round 2 to finish game.
			await fireAlarm(room, server);
			sendMessage(server, conn2, { type: 'startNextRound' });
			await fireAlarm(room, server);
		});

		it('Game status becomes finished after the final round ends', () => {
			const state = getLastState(conn1);
			expect(state?.state.status).toBe('finished');
			expect(state?.state.showingRoundSummary).toBe(true);
		});

		it('A disconnected player can rejoin after the game ends', () => {
			// Simulate the client navigating away and reconnecting with a new conn.id
			// but the same persistent playerId (from localStorage).
			server.onClose(conn1);
			const reconn = createMockConnection('player1-new');
			addConnection(room, reconn);
			server.onConnect(reconn, {} as Party.ConnectionContext);
			// Reuse Alice's original playerId
			joinAs(server, reconn, 'Alice', 'player1');

			expect(getLastError(reconn)).toBeUndefined();
			const state = getLastState(reconn);
			const alices = state?.state.players.filter(p => p.name === 'Alice') ?? [];
			expect(alices).toHaveLength(1);
			expect(alices[0].connected).toBe(true);
		});

		it('Players can join the play-again lobby after game ends', () => {
			sendMessage(server, conn1, { type: 'playAgain' });

			const state = getLastState(conn1);
			expect(state?.state.status).toBe('lobby');
			expect(state?.state.players).toHaveLength(1);
		});

		it('First player to click play again becomes host', () => {
			// Bob clicks first
			sendMessage(server, conn2, { type: 'playAgain' });

			const bobState = getLastState(conn2);
			expect(bobState?.state.players[0].isHost).toBe(true);
			expect(bobState?.state.players[0].name).toBe('Bob');

			// Alice clicks second
			sendMessage(server, conn1, { type: 'playAgain' });

			const aliceState = getLastState(conn1);
			expect(aliceState?.state.players[0].isHost).toBe(true); // Bob still host
			expect(aliceState?.state.players[1].isHost).toBe(false); // Alice not host
		});

		it('Host can start new game from play-again lobby', () => {
			sendMessage(server, conn1, { type: 'playAgain' });
			sendMessage(server, conn2, { type: 'playAgain' });

			// Host (Alice, first to click) starts game
			sendMessage(server, conn1, { type: 'start', category: 'animals' });

			const state = getLastState(conn1);
			expect(state?.state.status).toBe('playing');
			expect(state?.state.roundNumber).toBe(1);
		});
	});
});

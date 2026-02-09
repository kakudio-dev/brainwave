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

interface MockRoom {
	id: string;
	connections: Map<string, MockConnection & Party.Connection>;
	broadcasts: unknown[];
	getConnections: () => IterableIterator<Party.Connection>;
	broadcast: (data: string) => void;
}

function createMockRoom(id = 'TEST'): MockRoom & Party.Room {
	const room: MockRoom = {
		id,
		connections: new Map(),
		broadcasts: [],
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

			sendMessage(server, conn, { type: 'join', name: 'Alice' });

			const state = getLastState(conn);
			expect(state?.state.players).toHaveLength(1);
			expect(state?.state.players[0].name).toBe('Alice');
			expect(state?.state.status).toBe('lobby');
		});

		it('A player cannot join a game in progress', () => {
			// Setup: Two players join and start game
			const conn1 = createMockConnection('player1');
			const conn2 = createMockConnection('player2');
			addConnection(room, conn1);
			addConnection(room, conn2);
			server.onConnect(conn1, {} as Party.ConnectionContext);
			server.onConnect(conn2, {} as Party.ConnectionContext);

			sendMessage(server, conn1, { type: 'join', name: 'Alice' });
			sendMessage(server, conn2, { type: 'join', name: 'Bob' });
			sendMessage(server, conn1, { type: 'start', category: 'movies' });

			// New player tries to join
			const conn3 = createMockConnection('player3');
			addConnection(room, conn3);
			server.onConnect(conn3, {} as Party.ConnectionContext);
			sendMessage(server, conn3, { type: 'join', name: 'Charlie' });

			const error = getLastError(conn3);
			expect(error).toBe('Game already in progress');
		});

		it('First player to join becomes the host', () => {
			const conn1 = createMockConnection('player1');
			const conn2 = createMockConnection('player2');
			addConnection(room, conn1);
			addConnection(room, conn2);
			server.onConnect(conn1, {} as Party.ConnectionContext);
			server.onConnect(conn2, {} as Party.ConnectionContext);

			sendMessage(server, conn1, { type: 'join', name: 'Alice' });
			sendMessage(server, conn2, { type: 'join', name: 'Bob' });

			const state = getLastState(conn1);
			expect(state?.state.players[0].isHost).toBe(true);
			expect(state?.state.players[1].isHost).toBe(false);
		});

		it('When host leaves, another player becomes host', () => {
			const conn1 = createMockConnection('player1');
			const conn2 = createMockConnection('player2');
			addConnection(room, conn1);
			addConnection(room, conn2);
			server.onConnect(conn1, {} as Party.ConnectionContext);
			server.onConnect(conn2, {} as Party.ConnectionContext);

			sendMessage(server, conn1, { type: 'join', name: 'Alice' });
			sendMessage(server, conn2, { type: 'join', name: 'Bob' });

			// Host leaves
			room.connections.delete('player1');
			server.onClose(conn1);

			const state = getLastState(conn2);
			expect(state?.state.players).toHaveLength(1);
			expect(state?.state.players[0].name).toBe('Bob');
			expect(state?.state.players[0].isHost).toBe(true);
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

			sendMessage(server, conn1, { type: 'join', name: 'Alice' });
			sendMessage(server, conn2, { type: 'join', name: 'Bob' });
			sendMessage(server, conn3, { type: 'join', name: 'Charlie' });
			sendMessage(server, conn1, { type: 'start', category: 'movies' });

			// Non-guesser leaves
			room.connections.delete('player3');
			server.onClose(conn3);

			const state = getLastState(conn1);
			expect(state?.state.status).toBe('playing');
			expect(state?.state.players).toHaveLength(2);
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

			sendMessage(server, conn1, { type: 'join', name: 'Alice' });
			sendMessage(server, conn2, { type: 'join', name: 'Bob' });

			// Non-host tries to start
			sendMessage(server, conn2, { type: 'start', category: 'movies' });

			const error = getLastError(conn2);
			expect(error).toBe('Only the host can start the game');
		});

		it('Game requires at least 2 players to start', () => {
			const conn1 = createMockConnection('player1');
			addConnection(room, conn1);
			server.onConnect(conn1, {} as Party.ConnectionContext);

			sendMessage(server, conn1, { type: 'join', name: 'Alice' });
			sendMessage(server, conn1, { type: 'start', category: 'movies' });

			const error = getLastError(conn1);
			expect(error).toBe('Need at least 2 players to start');
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

			sendMessage(server, conn1, { type: 'join', name: 'Alice' });
			sendMessage(server, conn2, { type: 'join', name: 'Bob' });
			sendMessage(server, conn3, { type: 'join', name: 'Charlie' });
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

			sendMessage(server, conn1, { type: 'join', name: 'Alice' });
			sendMessage(server, conn2, { type: 'join', name: 'Bob' });
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

			sendMessage(server, conn1, { type: 'join', name: 'Alice' });
			sendMessage(server, conn2, { type: 'join', name: 'Bob' });
			sendMessage(server, conn1, { type: 'start', category: 'movies' });
		});

		it('Round ends when timer reaches zero', () => {
			// Advance time past round duration (10 seconds)
			vi.advanceTimersByTime(11000);

			const state = getLastState(conn1);
			expect(state?.state.showingRoundSummary).toBe(true);
		});

		it('Round summary shows all words with results', () => {
			// Get a correct word
			sendMessage(server, conn2, { type: 'correct' });
			sendMessage(server, conn1, { type: 'nextWord' });

			// Pass on a word
			sendMessage(server, conn1, { type: 'pass' });
			sendMessage(server, conn1, { type: 'nextWord' });

			// Let timer run out (timeout on current word)
			vi.advanceTimersByTime(11000);

			const state = getLastState(conn1);
			expect(state?.state.roundWords.length).toBeGreaterThanOrEqual(2);
			expect(state?.state.roundWords[0].result).toBe('correct');
			expect(state?.state.roundWords[1].result).toBe('pass');
		});

		it('Next guesser can start their turn from summary', () => {
			// End round
			vi.advanceTimersByTime(11000);

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

		it('Next guesser can skip their turn', () => {
			// End round
			vi.advanceTimersByTime(11000);

			const stateBefore = getLastState(conn1);
			expect(stateBefore?.state.roundNumber).toBe(1);

			// Next guesser skips
			sendMessage(server, conn2, { type: 'skipTurn' });

			const stateAfter = getLastState(conn1);
			expect(stateAfter?.state.roundNumber).toBe(2);
		});
	});

	describe('Play Again Flow', () => {
		let conn1: MockConnection & Party.Connection;
		let conn2: MockConnection & Party.Connection;

		beforeEach(() => {
			conn1 = createMockConnection('player1');
			conn2 = createMockConnection('player2');
			addConnection(room, conn1);
			addConnection(room, conn2);
			server.onConnect(conn1, {} as Party.ConnectionContext);
			server.onConnect(conn2, {} as Party.ConnectionContext);

			sendMessage(server, conn1, { type: 'join', name: 'Alice' });
			sendMessage(server, conn2, { type: 'join', name: 'Bob' });
			sendMessage(server, conn1, { type: 'start', category: 'movies' });

			// End all rounds to finish the game
			vi.advanceTimersByTime(11000); // End round 1
			sendMessage(server, conn2, { type: 'startNextRound' }); // Start round 2
			vi.advanceTimersByTime(11000); // End round 2, game finished
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

// POST /api/games/log
// Authenticated by a shared secret (Bearer token) that the PartyKit
// server holds. Two event shapes:
//   { event: 'start', id, roomCode, playerCount, categoryLabel, isCustomDeck }
//   { event: 'end',   id, totalTurns }

import type { Env } from '../../_shared/env';

interface StartEvent {
  event: 'start';
  id: string;
  roomCode: string;
  playerCount: number;
  categoryLabel: string;
  isCustomDeck: boolean;
}

interface EndEvent {
  event: 'end';
  id: string;
  totalTurns: number;
}

type LogEvent = StartEvent | EndEvent;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.GAME_LOG_SECRET) {
    // Fail closed if the secret isn't configured: better to drop telemetry
    // than to accept anonymous writes by accident.
    return new Response('Game logging not configured', { status: 503 });
  }

  const auth = request.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${env.GAME_LOG_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: LogEvent;
  try {
    body = (await request.json()) as LogEvent;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  try {
    if (body.event === 'start') {
      await env.DB
        .prepare(
          `INSERT INTO games (id, room_code, started_at, player_count, category_label, is_custom_deck)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO NOTHING`
        )
        .bind(
          body.id,
          body.roomCode,
          Date.now(),
          body.playerCount,
          body.categoryLabel,
          body.isCustomDeck ? 1 : 0
        )
        .run();
    } else if (body.event === 'end') {
      await env.DB
        .prepare('UPDATE games SET ended_at = ?, total_turns = ? WHERE id = ? AND ended_at IS NULL')
        .bind(Date.now(), body.totalTurns, body.id)
        .run();
    } else {
      return new Response('Unknown event', { status: 400 });
    }
  } catch (e) {
    console.error('games log failed', e);
    return new Response('Logging failed', { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

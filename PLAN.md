# Brainwave - Implementation Plan

## Overview
A web-based multiplayer word-guessing game (Heads Up! clone) where players join from their phones, take turns guessing words while others give clues.

## Tech Stack

**Frontend:** SvelteKit
- Tiny bundle sizes (cost-effective bandwidth)
- Great mobile experience
- Deploys free to Vercel/Cloudflare Pages

**Real-time Backend:** PartyKit
- Built specifically for multiplayer games
- Free tier: 100 concurrent connections
- Serverless (scales to zero when not in use)
- Simple WebSocket API

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   SvelteKit     │────▶│   PartyKit      │
│   (Frontend)    │◀────│   (WebSocket)   │
│   Vercel/CF     │     │   Server        │
└─────────────────┘     └─────────────────┘
        │
        ▼
   Player phones
   connect here
```

## Game Flow

1. **Host creates game** → Gets 4-letter room code (e.g., "WAVE")
2. **Players join** → Enter code, pick display name
3. **Lobby** → Host sees all players, starts when ready
4. **Round starts:**
   - One player is the guesser
   - Word appears on everyone else's screen
   - 60-second timer
   - Guesser swipes right (correct) or left (pass)
   - Score increments on correct
5. **Next round** → Next player becomes guesser
6. **Game ends** → After everyone has guessed, show final scores

## Project Structure

```
brainwave/
├── package.json
├── svelte.config.js
├── vite.config.js
├── src/
│   ├── app.html
│   ├── app.css              # Global styles (mobile-first)
│   ├── lib/
│   │   ├── stores/
│   │   │   └── game.ts      # Svelte stores for game state
│   │   ├── components/
│   │   │   ├── PlayerList.svelte
│   │   │   ├── WordDisplay.svelte
│   │   │   ├── Timer.svelte
│   │   │   └── SwipeCard.svelte
│   │   └── partykit.ts      # PartyKit client connection
│   └── routes/
│       ├── +page.svelte     # Home: Create/Join buttons
│       ├── +layout.svelte   # App shell
│       ├── create/
│       │   └── +page.svelte # Create game, get room code
│       ├── join/
│       │   └── +page.svelte # Enter room code + name
│       ├── lobby/[code]/
│       │   └── +page.svelte # Wait for players
│       └── game/[code]/
│           └── +page.svelte # Main game screen
├── party/
│   └── index.ts             # PartyKit server logic
└── partykit.json            # PartyKit config
```

## Data Model

```typescript
// Shared types
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
}

// WebSocket messages
type ClientMessage =
  | { type: 'join'; name: string }
  | { type: 'start' }
  | { type: 'correct' }
  | { type: 'pass' }
  | { type: 'nextRound' };

type ServerMessage =
  | { type: 'state'; state: GameState }
  | { type: 'error'; message: string };
```

## Word Categories (MVP)
Start with built-in word lists:
- Movies
- Animals
- Famous People
- Actions/Verbs

## Implementation Steps

### Phase 1: Project Setup
1. Initialize SvelteKit project with TypeScript
2. Set up PartyKit project
3. Configure for mobile-first CSS

### Phase 2: Core Infrastructure
1. PartyKit server with room management
2. Client connection wrapper
3. Svelte stores for reactive game state

### Phase 3: Game Screens
1. Home page (Create/Join)
2. Join page (enter code + name)
3. Lobby page (player list, start button)
4. Game page (word display, timer, swipe controls)
5. Results page (final scores)

### Phase 4: Game Logic
1. Room creation with unique codes
2. Player join/leave handling
3. Turn rotation
4. Timer countdown (server-authoritative)
5. Score tracking
6. Round/game end conditions

### Phase 5: Polish
1. Swipe gestures for correct/pass
2. Sound effects (optional)
3. Animations
4. Category selection

## UX Decisions
- **Controls:** Both swipe gestures AND buttons (swipe right/left or tap Correct/Pass)
- **Timer end:** "Last chance" mode - when timer hits 0, word stays visible for 3 more seconds for a final guess before auto-passing

## Verification
1. Open two browser windows/phones
2. Create a game in one, join from another
3. Start game, verify word shows for non-guesser only
4. Swipe correct/pass, verify score updates
5. Complete full round, verify turn rotation
6. Finish game, verify final scores display

## Cost Estimate
- **PartyKit free tier:** 100 concurrent connections (plenty for casual use)
- **Vercel free tier:** Unlimited static hosting
- **Total:** $0/month for moderate usage

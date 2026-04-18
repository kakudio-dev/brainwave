# Brainwave — Plan v2

Roadmap for the next four phases: performance, login, deck management, and rotating
free content. The Stripe paywall is intentionally deferred until the feature set has
been playtested and the pricing feels right.

## Goals

- Cut per-user server cost by an order of magnitude so the app comfortably stays on
  free-tier infrastructure until it has real traction.
- Let authenticated users create, save, and share their own decks, which is the
  biggest anticipated draw of the game.
- Give anonymous visitors a rotating taste of curated content so the free experience
  changes week to week and there's a reason to come back (and eventually sign up).
- Keep the architecture honest about where costs come from so later monetization
  decisions are based on real numbers, not guesses.

## Non-goals for this round

- Payment collection and the $5 license purchase flow. Will be designed in its own
  phase after the feature set has settled.
- Public deck browsing, upvoting, or featured-community content. That becomes
  worthwhile once there's a user base submitting decks; for now rotation pulls from
  curated content only.
- Native mobile apps / app-store billing. Web-only for the foreseeable future.
- Fine-grained deck sharing (collaborators, per-deck permissions). Decks are either
  owned privately, unlisted via a share code, or (future) public.

---

## Decisions already locked in

| Topic | Decision |
|---|---|
| Paywall in this plan | None. All authenticated users have full access. |
| Anonymous experience | Four rotating decks at a time. No permanent built-ins. |
| Custom decks | Creating, saving, and playing require an authenticated account. |
| Signup gating | Open. Anyone who can receive email can sign up. |
| Device policy | One active device per account. Switching devices is a magic-link round trip. |
| Deck count per account | 50 saved decks. |
| Words per deck | 1000 maximum. |
| Character length per word | 30, with surrounding whitespace trimmed and internal runs collapsed. |
| Rotation behavior during a live game | The game finishes with whichever deck it started on. Rotation only affects newly-started games. |

## Build order and scope

### Phase 1 — Move the timer off the hot path

**Problem.** The server currently broadcasts full game state every second while a
round is in progress. That's ~60 messages per player per minute, almost all of which
the client discards. It also prevents the Durable Object from hibernating between
real events, so every room burns CPU and request quota continuously while active.

**Change.** Convert the round timer from a server-side ticker into a wall-clock
deadline. When a round starts, the server computes the round's exact end time once
and includes both that end time and the current server time in the round-start
broadcast. Clients interpolate the countdown locally from those two values,
self-correcting for clock drift on every subsequent broadcast. State broadcasts
happen only on real transitions: join, start, correct, pass, reveal → next word,
round end, game end, play-again, and disconnect.

**Server wake-up.** The Durable Object uses the Alarms API instead of a long-lived
`setTimeout`. It registers an alarm for the round-end time and hibernates in between,
paying zero duration cost while idle.

**Client heartbeat.** A lightweight ping every 20-30 seconds from the client,
independent of the game state, keeps the WebSocket alive through any intermediate
proxies and gives the server a signal for "the human is still here." The server
replies with a tiny ack; no state travels.

**Reconnect and late joiners.** On reconnect, the server sends the current deadline
alongside its view of "now." Clients self-correct within one frame.

**Observable behavior change.** None visible to players. All existing unit tests
still apply; the tests that use `vi.advanceTimersByTime` will need a small update
where they advance the mocked system clock through the alarm rather than ticking
`setInterval`.

**Rollout.** Self-contained, backwards compatible across a deploy (clients can
tolerate both a new round message with a deadline and an old round message without).
Ship on its own.

---

### Phase 2 — Magic-link login, single device

**Goal.** Anyone can sign up with an email. Anyone signed in has full access to
everything Phase 3 will add. No payment involved.

**Login flow.** User enters their email → system mails a one-click link → link
carries a single-use token with a 15-minute expiry → clicking the link sets a
signed, HttpOnly, Secure, SameSite=Lax cookie on the app origin and redirects to
home. All subsequent requests carry the cookie.

**Single-device enforcement.** The server stores exactly one active session per
account. When a new login succeeds, any previous session's token is rotated to a
new random value. The previous device's next request gets a "device expired"
response; the client shows a modal with the email form, the user requests a new
link, and they're back in on the new device at the cost of the old one.

**Email infrastructure.** Resend's free tier (3k emails per month, no recurring
cost) for transactional sends. A single template covers both "your magic link" and
"activate your account" cases.

**Device labels.** Each session record includes a friendly label derived from the
user agent ("iPhone (Safari)", "MacBook (Chrome)"). The magic-link email includes
the label so the user sees "Activate on Jim's MacBook (Chrome)?" and can tell if
something phishy is happening.

**Data model (new D1 database `brainwave`).**

| Table | Purpose | Key columns |
|---|---|---|
| `accounts` | One row per signup | id, email (unique), created_at |
| `sessions` | At most one row per account | account_id (unique), token (random hex), device_label, created_at, last_seen_at |
| `magic_links` | Short-lived tokens | token (pk), email, device_label, expires_at, consumed_at |

**New Worker endpoints.**

| Endpoint | Behavior |
|---|---|
| `POST /api/auth/request` | Accepts an email and device label. Always responds 200 (no email enumeration). If the email exists or is valid, generates a magic link and sends the email. |
| `GET /api/auth/verify` | Validates the token, rotates the account's single session, sets the session cookie, redirects to `/`. |
| `POST /api/auth/logout` | Invalidates the current session, clears the cookie. |
| `GET /api/auth/me` | Returns the logged-in account's email, or 401. |

**UX surfaces.**

- New `/login` route with an email input and a "Send me a link" button. Success state
  explains the link will arrive in the user's inbox.
- Every screen shows an auth indicator in the header: either the user's email with a
  logout menu, or a "Log in" link.
- When a 401 comes back mid-session (because another device claimed the account),
  the app shows an unobtrusive modal prompting re-login without losing game state.

**Open question answered.** Phase 2 lands with absolutely no gate on signup: any
valid email can sign up and get full access during the beta. This is intentional.
Future phases may introduce paid gating on specific features but the account model
itself stays open.

---

### Phase 3 — Deck management

**Goal.** Authenticated users can create, edit, save, share, and play their own
decks. The free rotating-deck experience for anonymous users is unchanged.

**Ways to play a custom deck.**

1. **From My Decks.** The user picks a saved deck from their account library.
2. **From a code.** The user pastes a short slug (e.g. `GLIMMER`) shared by a friend
   and plays that deck for a game. Requires auth to view and to play.
3. **Pasted one-off.** The user pastes a list in a textarea during game setup. Not
   saved. Still auth-gated.

All three paths require the user to be signed in.

**Data model (new tables in D1).**

| Table | Purpose | Key columns |
|---|---|---|
| `decks` | One row per saved deck | id (short slug), owner_account_id, name, visibility (`private`\|`unlisted`\|`public`), created_at, updated_at |
| `deck_words` | One row per word | deck_id, position, word |

Storing words in a separate table (rather than a JSON blob on `decks`) makes
validation, word-count queries, pagination for large decks, and eventual word-level
editing all cheap. At 50 decks × 1000 words = 50k rows per user, D1's row-level
limits are comfortable.

**Validation rules applied on create and update.**

- Deck name: 1-60 characters after trim.
- Word count per deck: 10 (minimum to make a playable game) to 1000 (maximum).
- Word length: 1-30 characters after trim and whitespace collapse.
- Words de-duplicated within a deck, case-insensitively.
- Per-account cap: 50 decks. Attempting to create a 51st returns a clear error.
- Simple name/word profanity filter using a small word list. Not a moderation
  system; just keeps the obvious stuff out.

**New Worker endpoints.**

| Endpoint | Who can call it |
|---|---|
| `GET /api/decks` | Authenticated. Returns the caller's decks (with word counts, not full words). |
| `GET /api/decks/:slug` | Authenticated. Full deck. Enforces visibility: private is owner-only; unlisted requires knowing the slug; public is open. |
| `POST /api/decks` | Authenticated. Creates a deck with a server-generated slug. |
| `PUT /api/decks/:slug` | Authenticated, owner only. |
| `DELETE /api/decks/:slug` | Authenticated, owner only. |

**PartyKit message changes.** The `start` message grows to carry, in place of a
category, any one of:

- a built-in category name (unchanged from today for anonymous rotating content),
- a saved deck slug the host owns or has a code for,
- a literal word list for a one-off.

On receiving a deck slug, the server does a single D1 lookup to expand into a word
list before starting the round; on receiving a literal list, it validates min/max
and uses it directly without touching storage.

**Deck codes (slugs).** 8-character uppercase alphanumeric, generated server-side to
avoid collisions and to double as a human-shareable reference. The existing
"avoid I and O" habit from room codes applies.

**Lobby UX.** The category picker grows into a deck picker with four sections:

- **Rotating** — the four currently-featured decks, shown by default.
- **My decks** — the user's saved decks (authenticated only).
- **From code** — a small text input that resolves a slug.
- **Paste custom** — a textarea for a one-off deck.

**Constraints we're accepting for v1.**

- No collaborative editing.
- No deck forking.
- No public deck browsing or feed.
- No tagging or categorization beyond the rotating pool.

Each of the above is a deliberate "later" — Phase 3 ships the minimum useful
primitive (own it, save it, share it by link) and we add on top once real usage
reveals the priorities.

---

### Phase 4 — Rotating free decks

**Goal.** Anonymous visitors always see exactly four decks, and those four change
weekly. Authenticated users also see the rotating set alongside their own saved
decks.

**Source of content.** Curated decks that you author (or have authored on your
behalf) and commit to the repo as deck definitions, or a small admin UI. The
initial four categories (`movies`, `animals`, `famous-people`, `actions`) flow
through the rotation like any other curated deck.

**Rotation mechanism.**

- A `rotation_schedule` table maps a week-start date to four deck slugs. Missing
  entries fall back to a random pick of four from the curated pool.
- A Cloudflare Cron Trigger fires weekly (Monday 09:00 Pacific) and flips a
  `currently_featured` flag on the active four.
- Games that were started before rotation continue with their original deck (the
  rotation only affects new game creation, per the locked decision).
- Clients fetch the featured four via a cached `GET /api/decks/featured` endpoint
  that the static frontend can call on the home screen.

**Content plan.**

- Seed the pool with the current four. Add roughly one new curated deck per week
  at first, aiming for 12-16 decks in the pool within two months.
- Natural candidates: pop-culture decks ("90s movies", "TV shows", "memes"),
  niches ("dog breeds", "NBA players", "classic rock"), seasonal ("Christmas",
  "summer vacation", "spooky stuff"), and themed ("workplace", "dating", "kids").
- Seasonal decks are surfaced via the schedule table so they land on the right
  week without manual fiddling at the time.

**Anonymous UI.** The four featured decks show on the home screen and in the
lobby's category picker. Other deck sources (My decks, From code, Paste custom)
aren't visible to anonymous users; attempting to navigate to a custom-deck URL
prompts login first.

**Authenticated UI.** Same four rotating decks shown alongside saved decks. No
special treatment — they're just four more options.

---

### Phase 5 — Paywall (design only; not built yet)

Deliberately sketched here only so we remember how it slots in. When the feature
set has been playtested and the economics feel right:

- Add `accounts.licensed_at` and `accounts.license_source` (e.g. `stripe`).
- Stripe Checkout for a $5 one-time purchase; webhook sets the license fields on
  the matching account (email-matched).
- Gate the currently-ungated deck features (create, save, share, play custom)
  behind `licensed_at IS NOT NULL`. Existing users from the beta can either be
  grandfathered or prompted to purchase — decide at launch.
- Consider a "party pack" tier as the first upsell if device-sharing becomes a
  theme in user feedback.

All of the above is dormant code in the beta phase. The point of deferring is
so that by the time money changes hands, the product has been shaped by actual
usage.

---

## Cross-cutting concerns

### Cost at scale

With Phase 1 in place, the server's message load is dominated by real game events,
not timer ticks. Durable Objects hibernate between those events, which is the
"infrastructure cost near zero" story.

Storage ceiling per paid user: ~1.3 MB at the absolute hard cap (50 decks × 1000
words). At 100k paid users that's 130 GB → roughly $94/month on D1 beyond the
free tier. Far below any reasonable revenue from a paid base of that size, and the
realistic average is 5-10× smaller than the hard cap.

### Data lifecycle

- Accounts are kept indefinitely unless the user deletes.
- Sessions expire on idle after 60 days (configurable); unused rows are cleaned by
  a periodic job.
- Magic links expire 15 minutes after creation and are deleted on consume.
- Decks are deleted on account deletion (cascade).

### Safety and abuse

- Rate-limit `POST /api/auth/request` per IP and per email. Magic-link email floods
  are the obvious attack.
- Rate-limit deck creation per account (e.g. 10/minute) to prevent scripted fill.
- Word-list profanity filter on deck name/words at submit time.
- A simple report mechanism on shared decks (later), since unlisted slugs can
  still be posted publicly.

### Observability

- Log every auth event (link request, link verify, session rotation) with enough
  context to debug support questions. No full emails in logs; hash or truncate.
- Emit basic counters: decks created, games started, rotation events. The free
  Cloudflare Logs + Analytics tier covers this.

---

## Effort summary

| Phase | Effort | Depends on |
|---|---|---|
| 1 · Timer refactor | ~0.5 day | — |
| 2 · Login | ~1 day | — (independent of 1) |
| 3 · Decks | ~2 days | Phase 2 |
| 4 · Rotation | ~0.5 day + content | Phase 3 data model |
| 5 · Paywall | ~1 day + copywriting | Phase 2 |

Total engineering to beta: around four to five focused days. Content work on the
rotating pool is ongoing and decoupled from the engineering path.

## How we'll ship this

- One phase, one PR. Each phase ships as an independent change that can be
  playtested and merged on its own.
- Every phase keeps existing functionality working. Migrations are additive; no
  table drops.
- After each phase lands, a short playtest pass before starting the next phase.

<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { connect, disconnect, joinGame, startGame } from '$lib/partykit';
	import { gameState, playerId, isHost, connectionStatus, errorMessage } from '$lib/stores/game';
	import { CATEGORY_LABELS, type Category } from '$lib/types';
	import PlayerList from '$lib/components/PlayerList.svelte';
	import { authUser, refreshAuth } from '$lib/stores/auth';
	import { myDecks, refreshMyDecks, fetchDeck } from '$lib/stores/decks';

	type Mode =
		| { kind: 'category'; category: Category }
		| { kind: 'my-deck'; slug: string; name: string; words: string[] }
		| { kind: 'code' };

	let mode = $state<Mode>({ kind: 'category', category: 'movies' });
	let connecting = $state(true);

	// Deck code entry state
	let codeInput = $state('');
	let codeError = $state<string | null>(null);
	let codeLoading = $state(false);

	const roomCode = page.params.code!;
	const loggedIn = $derived(!!($authUser && typeof $authUser === 'object'));

	onMount(async () => {
		if ($connectionStatus !== 'connected') {
			const playerName = sessionStorage.getItem('playerName');
			if (!playerName) {
				goto('/join');
				return;
			}
			try {
				await connect(roomCode);
				joinGame(playerName);
				connecting = false;
			} catch (e) {
				console.error('Failed to connect:', e);
				connecting = false;
			}
		} else {
			connecting = false;
		}
		await refreshAuth();
		if (loggedIn) refreshMyDecks();
	});

	$effect(() => {
		if ($gameState?.status === 'playing') {
			goto(`/game/${roomCode}`);
		}
	});

	async function loadFromCode() {
		codeError = null;
		const slug = codeInput.trim().toUpperCase();
		if (!/^[A-Z0-9]{4,16}$/.test(slug)) {
			codeError = 'Codes are 8 uppercase letters.';
			return;
		}
		codeLoading = true;
		const result = await fetchDeck(slug);
		codeLoading = false;
		if (!result.ok) {
			codeError = result.status === 404 ? 'No deck with that code.' : result.error;
			return;
		}
		mode = { kind: 'my-deck', slug, name: result.deck.name, words: result.deck.words };
	}

	function selectMyDeck(slug: string) {
		const d = $myDecks?.find(x => x.slug === slug);
		if (!d) return;
		// Lazily load full words when starting, keep summary for display for now
		mode = { kind: 'my-deck', slug, name: d.name, words: [] };
	}

	async function handleStart() {
		if (mode.kind === 'category') {
			startGame(mode.category);
			return;
		}
		if (mode.kind === 'code') {
			codeError = 'Load a deck with its code first.';
			return;
		}
		if (mode.kind === 'my-deck') {
			// Refetch to get the latest word list from the server
			let words = mode.words;
			if (words.length === 0) {
				const result = await fetchDeck(mode.slug);
				if (!result.ok) {
					codeError = result.error;
					return;
				}
				words = result.deck.words;
			}
			startGame('movies', { words, deckName: mode.name });
		}
	}

	function copyCode() {
		navigator.clipboard.writeText(roomCode);
	}

	function isSelectedCategory(c: Category) {
		return mode.kind === 'category' && mode.category === c;
	}
	function isSelectedMyDeck(slug: string) {
		return mode.kind === 'my-deck' && mode.slug === slug;
	}
</script>

<div class="page">
	<button class="back-btn" onclick={() => { disconnect(); goto('/'); }}>
		<span>&larr;</span> Leave
	</button>

	<h1 class="mt-lg">Lobby</h1>

	<button class="room-code mt-md" onclick={copyCode} title="Click to copy">
		{roomCode}
	</button>
	<p class="text-muted text-sm mt-sm">Tap code to copy</p>

	{#if connecting || $connectionStatus === 'connecting'}
		<div class="status mt-xl">
			<div class="spinner"></div>
			<p class="mt-md">Connecting...</p>
		</div>
	{:else if $connectionStatus === 'error' || $errorMessage}
		<div class="status mt-xl text-danger">
			<p>{$errorMessage || 'Connection failed'}</p>
			<button class="btn btn--secondary mt-md" onclick={() => goto('/')}>Go Back</button>
		</div>
	{:else if $gameState}
		<div class="players-section mt-xl">
			<h3>Players ({$gameState.players.length})</h3>
			<PlayerList players={$gameState.players} currentPlayerId={$playerId} />
		</div>

		{#if $isHost}
			<div class="host-controls mt-xl">
				<h3>Pick a deck</h3>

				<div class="section mt-md">
					<h4 class="section-title">Featured</h4>
					<div class="pill-grid">
						{#each Object.entries(CATEGORY_LABELS) as [key, label]}
							<button
								class="pill"
								class:selected={isSelectedCategory(key as Category)}
								onclick={() => (mode = { kind: 'category', category: key as Category })}
							>
								{label}
							</button>
						{/each}
					</div>
				</div>

				{#if loggedIn}
					<div class="section mt-lg">
						<div class="section-head">
							<h4 class="section-title">My decks</h4>
							<a href="/decks" class="text-sm text-link">Manage →</a>
						</div>
						{#if $myDecks === null}
							<p class="text-muted text-sm">Loading…</p>
						{:else if $myDecks.length === 0}
							<p class="text-muted text-sm">
								You don't have any saved decks yet. <a class="text-link" href="/decks/new">Create one</a>.
							</p>
						{:else}
							<div class="pill-grid">
								{#each $myDecks as d (d.slug)}
									<button
										class="pill pill--with-meta"
										class:selected={isSelectedMyDeck(d.slug)}
										onclick={() => selectMyDeck(d.slug)}
									>
										<span class="pill-main">{d.name}</span>
										<span class="pill-meta">{d.word_count} words</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>

					<div class="section mt-lg">
						<h4 class="section-title">Have a deck code?</h4>
						{#if mode.kind === 'code'}
							<input
								type="text"
								class="form-input code-input"
								placeholder="e.g. GLIMMER7"
								bind:value={codeInput}
								maxlength="16"
								autocapitalize="characters"
								autocomplete="off"
							/>
							<button
								class="btn btn--secondary code-load-btn mt-sm"
								onclick={loadFromCode}
								disabled={codeLoading}
							>
								{codeLoading ? 'Loading…' : 'Load deck'}
							</button>
							{#if codeError}<p class="text-danger text-sm mt-sm">{codeError}</p>{/if}
						{:else}
							<button class="pill pill--wide" onclick={() => (mode = { kind: 'code' })}>
								Enter a deck code
							</button>
						{/if}
					</div>
				{:else}
					<p class="text-muted text-sm mt-lg">
						<a class="text-link" href="/login">Sign in</a> to play with custom decks.
					</p>
				{/if}

				<button
					class="btn btn--primary btn--large mt-xl start-btn"
					onclick={handleStart}
					disabled={$gameState.players.length < 2}
				>
					{#if $gameState.players.length < 2}
						Need 2+ players
					{:else if mode.kind === 'my-deck'}
						Start: {mode.name}
					{:else if mode.kind === 'category'}
						Start: {CATEGORY_LABELS[mode.category]}
					{:else}
						Load a deck above
					{/if}
				</button>
			</div>
		{:else}
			<div class="status mt-xl">
				<p>Waiting for host to start...</p>
			</div>
		{/if}
	{/if}
</div>

<style>
	.back-btn {
		background: none;
		border: none;
		color: var(--text-secondary);
		font-size: var(--text-base);
		cursor: pointer;
		padding: var(--spacing-sm) 0;
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.back-btn:hover {
		color: var(--text-primary);
	}

	.room-code {
		cursor: pointer;
		border: none;
		transition: transform var(--transition-fast);
	}

	.room-code:hover {
		transform: scale(1.02);
	}

	.players-section h3 {
		margin-bottom: var(--spacing-md);
	}

	.section {
		display: flex;
		flex-direction: column;
	}

	.section-title {
		font-size: var(--text-sm);
		color: var(--text-muted);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: var(--spacing-sm);
	}

	.section-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}

	.text-link {
		color: var(--color-primary);
		text-decoration: none;
	}

	.text-link:hover {
		text-decoration: underline;
	}

	.pill-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
		gap: var(--spacing-sm);
	}

	.pill {
		padding: var(--spacing-md);
		background: var(--bg-secondary);
		border: 2px solid transparent;
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-size: var(--text-base);
		font-weight: 500;
		cursor: pointer;
		text-align: left;
		transition: all var(--transition-fast);
	}

	.pill:hover {
		background: var(--bg-card);
	}

	.pill.selected {
		border-color: var(--color-primary);
		background: rgba(99, 102, 241, 0.2);
	}

	.pill--with-meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.pill-meta {
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	.pill--wide {
		width: 100%;
		text-align: center;
		font-weight: 400;
		color: var(--text-secondary);
	}

	.form-input {
		width: 100%;
		padding: var(--spacing-md);
		background: var(--bg-secondary);
		border: 2px solid transparent;
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-size: var(--text-base);
		font-family: inherit;
	}

	.form-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.code-input {
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-family: monospace;
		text-align: center;
		font-size: var(--text-lg);
	}

	.code-load-btn {
		width: 100%;
	}

	.start-btn {
		width: 100%;
	}
</style>

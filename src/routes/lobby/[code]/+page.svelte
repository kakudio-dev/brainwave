<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { connect, disconnect, joinGame, startGame } from '$lib/partykit';
	import { gameState, playerId, isHost, connectionStatus, errorMessage } from '$lib/stores/game';
	import { CATEGORY_LABELS, type Category } from '$lib/types';
	import PlayerList from '$lib/components/PlayerList.svelte';

	let selectedCategory = $state<Category>('movies');
	let connecting = $state(true);

	const roomCode = page.params.code!;

	onMount(async () => {
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
	});

	onDestroy(() => {
		// Don't disconnect if navigating to game
		// disconnect() will be called if they leave
	});

	// Watch for game start
	$effect(() => {
		if ($gameState?.status === 'playing') {
			goto(`/game/${roomCode}`);
		}
	});

	function handleStart() {
		startGame(selectedCategory);
	}

	function copyCode() {
		navigator.clipboard.writeText(roomCode);
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
			<button class="btn btn--secondary mt-md" onclick={() => goto('/')}>
				Go Back
			</button>
		</div>
	{:else if $gameState}
		<div class="players-section mt-xl">
			<h3>Players ({$gameState.players.length})</h3>
			<PlayerList
				players={$gameState.players}
				currentPlayerId={$playerId}
			/>
		</div>

		{#if $isHost}
			<div class="host-controls mt-xl">
				<h3>Category</h3>
				<div class="category-grid mt-md">
					{#each Object.entries(CATEGORY_LABELS) as [key, label]}
						<button
							class="category-btn"
							class:selected={selectedCategory === key}
							onclick={() => selectedCategory = key as Category}
						>
							{label}
						</button>
					{/each}
				</div>

				<button
					class="btn btn--primary btn--large mt-xl"
					onclick={handleStart}
					disabled={$gameState.players.length < 2}
				>
					{#if $gameState.players.length < 2}
						Need 2+ players
					{:else}
						Start Game
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

	.room-code:active {
		transform: scale(0.98);
	}

	.players-section h3 {
		margin-bottom: var(--spacing-md);
	}

	.category-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--spacing-sm);
	}

	.category-btn {
		padding: var(--spacing-md);
		background: var(--bg-secondary);
		border: 2px solid transparent;
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-size: var(--text-base);
		font-weight: 500;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.category-btn:hover {
		background: var(--bg-card);
	}

	.category-btn.selected {
		border-color: var(--color-primary);
		background: rgba(99, 102, 241, 0.2);
	}
</style>

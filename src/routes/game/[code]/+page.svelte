<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { connect, disconnect, joinGame, markCorrect, markPass, nextRound, playAgain } from '$lib/partykit';
	import {
		gameState,
		playerId,
		currentWord,
		isHost,
		isGuesser,
		currentGuesser,
		sortedPlayers,
		connectionStatus,
		roundEndEvent
	} from '$lib/stores/game';
	import PlayerList from '$lib/components/PlayerList.svelte';
	import Timer from '$lib/components/Timer.svelte';
	import WordDisplay from '$lib/components/WordDisplay.svelte';
	import SwipeCard from '$lib/components/SwipeCard.svelte';

	let showRoundEnd = $state(false);
	let roundEndScore = $state(0);

	const roomCode = page.params.code!;

	onMount(async () => {
		// If not connected, try to reconnect
		if ($connectionStatus !== 'connected') {
			const playerName = sessionStorage.getItem('playerName');
			if (!playerName) {
				goto('/join');
				return;
			}
			try {
				await connect(roomCode);
				joinGame(playerName);
			} catch (e) {
				console.error('Failed to connect:', e);
				goto('/');
			}
		}
	});

	onDestroy(() => {
		disconnect();
	});

	// Watch for game state changes
	$effect(() => {
		if ($gameState?.status === 'lobby') {
			goto(`/lobby/${roomCode}`);
		}
	});

	// Watch for round end
	$effect(() => {
		if ($roundEndEvent) {
			roundEndScore = $roundEndEvent.score;
			showRoundEnd = true;
			roundEndEvent.set(null);
		}
	});

	function handleCorrect() {
		markCorrect();
	}

	function handlePass() {
		markPass();
	}

	function handleNextRound() {
		showRoundEnd = false;
		nextRound();
	}

	function handlePlayAgain() {
		playAgain();
	}

	function handleLeave() {
		disconnect();
		goto('/');
	}
</script>

<div class="page game-page">
	{#if !$gameState}
		<div class="status">
			<div class="spinner"></div>
			<p class="mt-md">Loading...</p>
		</div>
	{:else if $gameState.status === 'finished'}
		<!-- Game Over Screen -->
		<div class="game-over">
			<h1>Game Over!</h1>

			<div class="results mt-xl">
				<h2>Final Scores</h2>
				<div class="podium mt-lg">
					{#each $sortedPlayers.slice(0, 3) as player, i}
						<div class="podium-place" class:first={i === 0} class:second={i === 1} class:third={i === 2}>
							<span class="place-number">{i === 0 ? '1st' : i === 1 ? '2nd' : '3rd'}</span>
							<span class="place-name">{player.name}</span>
							<span class="place-score">{player.score}</span>
						</div>
					{/each}
				</div>

				{#if $sortedPlayers.length > 3}
					<div class="other-players mt-lg">
						<PlayerList
							players={$sortedPlayers.slice(3)}
							currentPlayerId={$playerId}
							showScores={true}
						/>
					</div>
				{/if}
			</div>

			{#if $isHost}
				<div class="actions mt-xl flex flex-col gap-md">
					<button class="btn btn--primary" onclick={handlePlayAgain}>
						Play Again
					</button>
					<button class="btn btn--secondary" onclick={handleLeave}>
						Leave Game
					</button>
				</div>
			{:else}
				<div class="actions mt-xl">
					<button class="btn btn--secondary" onclick={handleLeave}>
						Leave Game
					</button>
				</div>
			{/if}
		</div>
	{:else}
		<!-- Playing Screen -->
		<div class="game-header">
			<div class="round-info">
				<span class="category">{$gameState.category}</span>
				<span class="round">Round {$gameState.roundNumber}/{$gameState.totalRounds}</span>
			</div>
			<Timer
				seconds={$gameState.roundTimeLeft}
				isLastChance={$gameState.lastChanceMode}
			/>
		</div>

		<div class="game-content">
			{#if $isGuesser}
				<!-- Guesser View -->
				<SwipeCard onCorrect={handleCorrect} onPass={handlePass}>
					<WordDisplay word={null} isGuesser={true} />
				</SwipeCard>
			{:else}
				<!-- Clue Giver View -->
				<div class="clue-giver-view">
					<p class="current-guesser text-secondary mb-md">
						{$currentGuesser?.name} is guessing
					</p>
					<WordDisplay word={$currentWord} />
					<p class="instruction mt-lg text-muted">
						Give clues without saying the word!
					</p>
				</div>
			{/if}
		</div>

		<div class="game-footer">
			<div class="mini-scores">
				{#each $gameState.players as player}
					<div class="mini-score" class:is-guesser={player.id === $currentGuesser?.id}>
						<span class="name">{player.name.slice(0, 8)}</span>
						<span class="score">{player.score}</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- Round End Modal -->
		{#if showRoundEnd}
			<div class="modal-overlay">
				<div class="modal">
					<h2>Round Complete!</h2>
					<p class="mt-md">{$currentGuesser?.name} scored {roundEndScore} points</p>

					{#if $isHost}
						<button class="btn btn--primary mt-xl" onclick={handleNextRound}>
							{$gameState.roundNumber >= $gameState.totalRounds ? 'See Results' : 'Next Round'}
						</button>
					{:else}
						<p class="mt-xl text-muted">Waiting for host...</p>
					{/if}
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.game-page {
		padding: var(--spacing-md);
		justify-content: space-between;
		max-width: none;
	}

	.game-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
	}

	.round-info {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.category {
		font-size: var(--text-sm);
		color: var(--text-muted);
		text-transform: capitalize;
	}

	.round {
		font-size: var(--text-lg);
		font-weight: 600;
	}

	.game-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: var(--spacing-lg) 0;
	}

	.clue-giver-view {
		text-align: center;
	}

	.current-guesser {
		font-size: var(--text-lg);
	}

	.instruction {
		font-size: var(--text-sm);
	}

	.game-footer {
		padding-top: var(--spacing-md);
		border-top: 1px solid var(--bg-card);
	}

	.mini-scores {
		display: flex;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
		justify-content: center;
	}

	.mini-score {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: var(--spacing-sm);
		background: var(--bg-secondary);
		border-radius: var(--radius-sm);
		min-width: 4rem;
	}

	.mini-score.is-guesser {
		background: rgba(99, 102, 241, 0.2);
		border: 1px solid var(--color-primary);
	}

	.mini-score .name {
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	.mini-score .score {
		font-size: var(--text-lg);
		font-weight: 700;
	}

	/* Game Over Styles */
	.game-over {
		text-align: center;
		padding: var(--spacing-xl) 0;
	}

	.podium {
		display: flex;
		justify-content: center;
		align-items: flex-end;
		gap: var(--spacing-sm);
	}

	.podium-place {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: var(--spacing-md);
		background: var(--bg-secondary);
		border-radius: var(--radius-md);
		min-width: 5rem;
	}

	.podium-place.first {
		background: linear-gradient(135deg, #ffd700, #ffaa00);
		color: #000;
		padding: var(--spacing-lg);
		transform: scale(1.1);
	}

	.podium-place.second {
		background: linear-gradient(135deg, #c0c0c0, #a0a0a0);
		color: #000;
	}

	.podium-place.third {
		background: linear-gradient(135deg, #cd7f32, #a0522d);
		color: #fff;
	}

	.place-number {
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.place-name {
		font-size: var(--text-lg);
		font-weight: 700;
		margin: var(--spacing-sm) 0;
	}

	.place-score {
		font-size: var(--text-2xl);
		font-weight: 800;
	}

	.other-players {
		max-width: 20rem;
		margin: 0 auto;
	}

	/* Modal */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: var(--spacing-lg);
	}

	.modal {
		background: var(--bg-secondary);
		padding: var(--spacing-xl);
		border-radius: var(--radius-lg);
		text-align: center;
		max-width: 20rem;
		width: 100%;
	}
</style>

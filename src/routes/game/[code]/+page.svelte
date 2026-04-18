<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { connect, disconnect, joinGame, markCorrect, markPass, goToNextWord, startNextRound, skipTurn, playAgain } from '$lib/partykit';
	import {
		gameState,
		playerId,
		currentWord,
		isHost,
		isGuesser,
		currentGuesser,
		nextGuesser,
		isNextGuesser,
		connectionStatus
	} from '$lib/stores/game';
	import Timer from '$lib/components/Timer.svelte';
	import WordDisplay from '$lib/components/WordDisplay.svelte';

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

	// Socket teardown is handled explicitly (Leave Game) or by the browser on tab close.
	// Disconnecting here would break the in-room transition to the rematch lobby.

	// Watch for game state changes
	$effect(() => {
		if ($gameState?.status === 'lobby') {
			goto(`/lobby/${roomCode}`);
		}
	});

	function handleCorrect() {
		markCorrect();
	}

	function handlePass() {
		markPass();
	}

	function handleStartNextRound() {
		startNextRound();
	}

	function handleSkipTurn() {
		skipTurn();
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
	{:else if $gameState.showingRoundSummary || $gameState.status === 'finished'}
		<!-- Round Summary Screen -->
		<div class="round-summary">
			<h1>Round {$gameState.roundNumber} Complete!</h1>
			<p class="text-secondary mt-sm">{$currentGuesser?.name}'s turn is over</p>

			<div class="word-timeline mt-xl">
				{#if $gameState.roundWords.length === 0}
					<p class="text-muted">No words this round</p>
				{:else}
					<ul class="timeline-list">
						{#each $gameState.roundWords as roundWord, i}
							<li
								class="timeline-item"
								class:correct={roundWord.result === 'correct'}
								class:pass={roundWord.result === 'pass'}
								class:timeout={roundWord.result === 'timeout'}
								style="animation-delay: {i * 225}ms"
							>
								<span class="word-text">{roundWord.word}</span>
								<span class="result-icon">
									{#if roundWord.result === 'correct'}✓{:else if roundWord.result === 'pass'}✗{:else}–{/if}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div class="next-up mt-xl">
				{#if $gameState.roundNumber >= $gameState.totalRounds}
					<p class="text-lg">That was the last round!</p>
					<div class="actions mt-lg flex flex-col gap-md">
						<button class="btn btn--primary" onclick={handlePlayAgain}>
							Play Again
						</button>
						<button class="btn btn--secondary" onclick={handleLeave}>
							Leave Game
						</button>
					</div>
				{:else}
					<p class="text-lg">Up next: <strong>{$nextGuesser?.name}</strong></p>
					{#if $isNextGuesser}
						<div class="actions mt-lg flex flex-col gap-md">
							<button class="btn btn--primary btn--large" onclick={handleStartNextRound}>
								Start My Turn
							</button>
							<button class="btn btn--secondary" onclick={handleSkipTurn}>
								Skip My Turn
							</button>
						</div>
					{:else}
						<p class="mt-lg text-muted">Waiting for {$nextGuesser?.name} to start...</p>
					{/if}
				{/if}
			</div>
		</div>
	{:else}
		<!-- Playing Screen -->
		<div class="game-header">
			<div class="round-info">
				<span class="category">{$gameState.category}</span>
				<span class="round">Round {$gameState.roundNumber}/{$gameState.totalRounds}</span>
			</div>
			<Timer endsAt={$gameState.roundEndsAt} />
		</div>

		<div class="game-content">
			{#if $gameState.wordRevealed}
				<!-- Word Revealed - show to everyone -->
				<div class="revealed-view">
					<div class="result-badge" class:correct={$gameState.lastWordResult === 'correct'} class:pass={$gameState.lastWordResult === 'pass'}>
						{$gameState.lastWordResult === 'correct' ? 'Correct!' : 'Passed'}
					</div>
					<WordDisplay word={$currentWord} />
					{#if $isGuesser}
						<button class="btn btn--primary btn--large mt-xl" onclick={goToNextWord}>
							Next Word
						</button>
					{:else}
						<p class="mt-xl text-muted">Waiting for {$currentGuesser?.name}...</p>
					{/if}
				</div>
			{:else if $isGuesser}
				<!-- Guesser View - can only pass -->
				<div class="guesser-view">
					<WordDisplay word={null} isGuesser={true} />
				</div>
			{:else}
				<!-- Clue Giver View - can mark correct -->
				<div class="clue-giver-view">
					<p class="current-guesser text-secondary mb-md">
						{$currentGuesser?.name} is guessing
					</p>
					<WordDisplay word={$currentWord} />
				</div>
			{/if}
		</div>

		<div class="game-footer">
			{#if !$gameState.wordRevealed}
				{#if $isGuesser}
					<button class="btn btn--secondary" onclick={handlePass}>
						Pass
					</button>
				{:else}
					<button class="btn btn--success" onclick={handleCorrect}>
						Correct!
					</button>
				{/if}
			{/if}
			<div class="current-score">
				<span class="score-label">{$currentGuesser?.name}'s score</span>
				<span class="score-value">{$currentGuesser?.score ?? 0}</span>
			</div>
		</div>
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

	.clue-giver-view,
	.guesser-view,
	.revealed-view {
		text-align: center;
	}

	.current-guesser {
		font-size: var(--text-lg);
	}

	.result-badge {
		display: inline-block;
		padding: var(--spacing-sm) var(--spacing-lg);
		border-radius: var(--radius-full);
		font-size: var(--text-lg);
		font-weight: 700;
		margin-bottom: var(--spacing-lg);
	}

	.result-badge.correct {
		background: rgba(34, 197, 94, 0.2);
		color: var(--color-success);
	}

	.result-badge.pass {
		background: rgba(239, 68, 68, 0.2);
		color: var(--color-danger);
	}

	.game-footer {
		padding-top: var(--spacing-md);
		border-top: 1px solid var(--bg-card);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.game-footer .btn {
		width: 100%;
	}

	.current-score {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.score-label {
		font-size: var(--text-sm);
		color: var(--text-muted);
	}

	.score-value {
		font-size: var(--text-3xl);
		font-weight: 800;
		color: var(--color-primary);
	}

	/* Round Summary Styles */
	.round-summary {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: var(--spacing-lg) 0;
		overflow-y: auto;
	}

	.word-timeline {
		width: 100%;
		max-width: 20rem;
		padding: var(--spacing-md) 0;
	}

	.timeline-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.timeline-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		font-size: var(--text-base);
		opacity: 0;
		transform: translateY(10px) scale(0.9);
		animation: timeline-item-in 0.45s ease-out forwards;
	}

	.timeline-item.correct {
		background: rgba(34, 197, 94, 0.15);
		border: 1px solid rgba(34, 197, 94, 0.3);
	}

	.timeline-item.pass {
		background: rgba(239, 68, 68, 0.15);
		border: 1px solid rgba(239, 68, 68, 0.3);
	}

	.timeline-item.timeout {
		background: rgba(156, 163, 175, 0.15);
		border: 1px solid rgba(156, 163, 175, 0.3);
	}

	.word-text {
		font-weight: 500;
	}

	.result-icon {
		font-size: var(--text-sm);
		font-weight: 700;
	}

	.timeline-item.correct .result-icon {
		color: var(--color-success);
	}

	.timeline-item.pass .result-icon {
		color: var(--color-danger);
	}

	.timeline-item.timeout .result-icon {
		color: var(--text-muted);
	}

	@keyframes timeline-item-in {
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.next-up {
		margin-top: auto;
		padding-top: var(--spacing-lg);
	}

	.next-up strong {
		color: var(--color-primary);
	}

	.next-up .actions {
		width: 100%;
		max-width: 16rem;
	}
</style>

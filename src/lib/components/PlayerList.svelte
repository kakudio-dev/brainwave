<script lang="ts">
	import type { Player } from '$lib/types';

	interface Props {
		players: Player[];
		currentPlayerId?: string | null;
		currentGuesserId?: string | null;
		showScores?: boolean;
	}

	let { players, currentPlayerId = null, currentGuesserId = null, showScores = false }: Props = $props();
</script>

<ul class="player-list">
	{#each players as player (player.id)}
		<li class="player-item" class:is-you={player.id === currentPlayerId} class:is-guesser={player.id === currentGuesserId}>
			<div class="player-info">
				<span class="player-name">
					{player.name}
					{#if player.id === currentPlayerId}
						<span class="you-badge">(You)</span>
					{/if}
				</span>
				{#if player.isHost}
					<span class="player-host">Host</span>
				{/if}
				{#if player.id === currentGuesserId}
					<span class="guesser-badge">Guessing</span>
				{/if}
			</div>
			{#if showScores}
				<span class="player-score">{player.score}</span>
			{/if}
		</li>
	{/each}
</ul>

<style>
	.player-item.is-you {
		border-left: 3px solid var(--color-primary);
	}

	.player-item.is-guesser {
		background: rgba(99, 102, 241, 0.2);
	}

	.player-info {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
	}

	.you-badge {
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	.guesser-badge {
		font-size: var(--text-xs);
		color: var(--color-secondary);
		padding: var(--spacing-xs) var(--spacing-sm);
		background: rgba(139, 92, 246, 0.2);
		border-radius: var(--radius-sm);
	}
</style>

<script lang="ts">
	interface Props {
		word: string | null;
		isGuesser?: boolean;
	}

	let { word, isGuesser = false }: Props = $props();
</script>

<div class="word-display">
	{#if isGuesser}
		<span class="guesser-message">It's your turn to guess!</span>
	{:else if word}
		<span class="word">{word}</span>
	{:else}
		<span class="waiting">Waiting...</span>
	{/if}
</div>

<style>
	.guesser-message {
		font-size: var(--text-2xl);
		color: var(--color-secondary);
	}

	.word {
		font-size: var(--text-4xl);
		font-weight: 800;
	}

	.waiting {
		color: var(--text-muted);
		font-size: var(--text-xl);
	}

	@media (min-width: 640px) {
		.word {
			font-size: var(--text-5xl);
		}
	}
</style>

<script lang="ts">
	interface Props {
		seconds: number;
		isLastChance?: boolean;
	}

	let { seconds, isLastChance = false }: Props = $props();

	let timerClass = $derived(
		isLastChance ? 'timer timer--danger' :
		seconds <= 10 ? 'timer timer--warning' :
		'timer'
	);
</script>

<div class={timerClass}>
	{#if isLastChance}
		<span class="last-chance-label">Last Chance!</span>
	{/if}
	<span class="time">{seconds}</span>
</div>

<style>
	.last-chance-label {
		display: block;
		font-size: var(--text-lg);
		font-weight: 600;
		margin-bottom: var(--spacing-sm);
	}
</style>

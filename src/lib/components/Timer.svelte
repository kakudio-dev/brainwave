<script lang="ts">
	import { onDestroy } from 'svelte';

	interface Props {
		// Wall-clock timestamp (ms, server epoch) when the round ends. null when
		// no round is active. The server no longer ticks the timer once a second;
		// it sends the deadline once and we compute the countdown locally.
		endsAt: number | null;
	}

	let { endsAt }: Props = $props();

	function compute(now: number, deadline: number | null): number {
		if (deadline === null) return 0;
		return Math.max(0, Math.ceil((deadline - now) / 1000));
	}

	// Seeded from the $effect below on mount and on every endsAt change.
	let seconds = $state(0);

	// Re-render once per second while a deadline is active.
	let interval: ReturnType<typeof setInterval> | null = null;

	$effect(() => {
		// Recompute immediately whenever endsAt changes (start of round, end of round).
		seconds = compute(Date.now(), endsAt);

		if (interval) {
			clearInterval(interval);
			interval = null;
		}
		if (endsAt !== null) {
			interval = setInterval(() => {
				seconds = compute(Date.now(), endsAt);
				if (seconds === 0 && interval) {
					clearInterval(interval);
					interval = null;
				}
			}, 250);
		}
	});

	onDestroy(() => {
		if (interval) clearInterval(interval);
	});

	let timerClass = $derived(
		seconds <= 5 ? 'timer timer--danger' :
		seconds <= 10 ? 'timer timer--warning' :
		'timer'
	);
</script>

<div class={timerClass}>
	<span class="time">{seconds}</span>
</div>

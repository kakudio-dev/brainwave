<script lang="ts">
	import { onDestroy } from 'svelte';
	import { serverClockOffset } from '$lib/stores/game';

	interface Props {
		// Wall-clock timestamp (ms, server epoch) when the round ends. null when
		// no round is active. The server no longer ticks the timer once a second;
		// it sends the deadline once and we compute the countdown locally against
		// the server's clock (Date.now() + offset) so phone clock drift doesn't
		// leave "2 seconds left" on screen when the round actually just ended.
		endsAt: number | null;
	}

	let { endsAt }: Props = $props();

	function compute(deadline: number | null): number {
		if (deadline === null) return 0;
		const serverNow = Date.now() + $serverClockOffset;
		return Math.max(0, Math.ceil((deadline - serverNow) / 1000));
	}

	// Seeded from the $effect below on mount and on every endsAt change.
	let seconds = $state(0);

	// Re-render once per second while a deadline is active.
	let interval: ReturnType<typeof setInterval> | null = null;

	$effect(() => {
		// Recompute immediately whenever endsAt changes (start of round, end of round).
		seconds = compute(endsAt);

		if (interval) {
			clearInterval(interval);
			interval = null;
		}
		if (endsAt !== null) {
			interval = setInterval(() => {
				seconds = compute(endsAt);
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

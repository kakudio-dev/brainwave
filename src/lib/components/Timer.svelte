<script lang="ts">
	interface Props {
		seconds: number;
	}

	let { seconds }: Props = $props();

	let timerClass = $derived(
		seconds <= 5 ? 'timer timer--danger' :
		seconds <= 10 ? 'timer timer--warning' :
		'timer'
	);
</script>

<div class={timerClass}>
	<span class="time">{seconds}</span>
</div>

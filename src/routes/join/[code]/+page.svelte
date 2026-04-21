<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	const roomCode = $derived((page.params.code ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4));
	let playerName = $state('');

	function handleJoin() {
		const name = playerName.trim();
		if (!name || roomCode.length !== 4) return;
		sessionStorage.setItem('playerName', name);
		sessionStorage.setItem('isHost', 'false');
		goto(`/lobby/${roomCode}`);
	}
</script>

<div class="page">
	<button class="back-btn" onclick={() => goto('/')}>
		<span>&larr;</span> Back
	</button>

	{#if roomCode.length !== 4}
		<h1 class="mt-lg">Invalid code</h1>
		<p class="text-secondary mt-sm">
			That link doesn't look like a Brainwave game. Room codes are 4 letters.
		</p>
		<button class="btn btn--primary mt-lg" onclick={() => goto('/join')}>
			Enter a code manually
		</button>
	{:else}
		<h1 class="mt-lg">Join Game</h1>
		<p class="text-secondary mb-xl">
			You're joining room <strong class="room-code-inline">{roomCode}</strong>.
		</p>

		<form
			class="flex flex-col gap-md"
			onsubmit={(e) => {
				e.preventDefault();
				handleJoin();
			}}
		>
			<input
				type="text"
				class="input"
				placeholder="Your name"
				bind:value={playerName}
				maxlength="20"
				autocomplete="off"
			/>

			<button type="submit" class="btn btn--primary" disabled={!playerName.trim()}>
				Join Room
			</button>
		</form>
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

	.room-code-inline {
		letter-spacing: 0.15em;
		font-family: monospace;
		font-size: 1.1em;
		color: var(--color-primary);
	}
</style>

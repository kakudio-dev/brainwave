<script lang="ts">
	import { goto } from '$app/navigation';

	let playerName = $state('');
	let roomCode = $state('');

	function handleJoin() {
		if (!playerName.trim() || roomCode.length !== 4) return;
		sessionStorage.setItem('playerName', playerName.trim());
		sessionStorage.setItem('isHost', 'false');
		goto(`/lobby/${roomCode.toUpperCase()}`);
	}

	function handleCodeInput(e: Event) {
		const input = e.target as HTMLInputElement;
		roomCode = input.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
	}
</script>

<div class="page">
	<button class="back-btn" onclick={() => goto('/')}>
		<span>&larr;</span> Back
	</button>

	<h1 class="mt-lg">Join Game</h1>
	<p class="text-secondary mb-xl">Enter the room code to join</p>

	<form class="flex flex-col gap-md" onsubmit={(e) => { e.preventDefault(); handleJoin(); }}>
		<input
			type="text"
			class="input input--code"
			placeholder="CODE"
			value={roomCode}
			oninput={handleCodeInput}
			maxlength="4"
			autocomplete="off"
			autocapitalize="characters"
		/>

		<input
			type="text"
			class="input"
			placeholder="Your name"
			bind:value={playerName}
			maxlength="20"
			autocomplete="off"
		/>

		<button
			type="submit"
			class="btn btn--primary"
			disabled={!playerName.trim() || roomCode.length !== 4}
		>
			Join Room
		</button>
	</form>
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
</style>

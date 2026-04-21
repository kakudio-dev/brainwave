<script lang="ts">
	import { goto } from '$app/navigation';
	import { generateRoomCode } from '$lib/partykit';

	let playerName = $state('');

	function handleCreate() {
		const name = playerName.trim();
		if (!name) return;
		const roomCode = generateRoomCode();
		sessionStorage.setItem('playerName', name);
		sessionStorage.setItem('isHost', 'true');
		goto(`/lobby/${roomCode}`);
	}
</script>

<div class="page">
	<button class="back-btn" onclick={() => goto('/')}>
		<span>&larr;</span> Back
	</button>

	<h1 class="mt-lg">Create Game</h1>
	<p class="text-secondary mb-xl">
		You'll get a code to share with your friends on the next screen.
	</p>

	<form
		class="flex flex-col gap-md"
		onsubmit={(e) => {
			e.preventDefault();
			handleCreate();
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
			Create Room
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

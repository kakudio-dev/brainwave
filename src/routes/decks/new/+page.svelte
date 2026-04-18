<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import DeckEditor from '$lib/components/DeckEditor.svelte';
	import { createDeck } from '$lib/stores/decks';
	import { authUser, refreshAuth } from '$lib/stores/auth';

	let busy = $state(false);
	let serverError = $state<string | null>(null);

	onMount(async () => {
		await refreshAuth();
		if (!$authUser || typeof $authUser !== 'object') {
			goto('/login');
		}
	});

	async function submit(name: string, words: string[]) {
		busy = true;
		serverError = null;
		const result = await createDeck({ name, words });
		busy = false;
		if (!result.ok) {
			serverError = result.error;
			return;
		}
		goto(`/decks/${result.deck.slug}`);
	}
</script>

<div class="page">
	<h1>New deck</h1>
	<p class="text-secondary mt-sm">
		Pick a theme, list the words, and you'll get a share code you can send to friends.
	</p>

	<div class="mt-lg">
		<DeckEditor
			submitLabel="Create deck"
			onSubmit={submit}
			{busy}
			{serverError}
		/>
	</div>

	<p class="mt-xl text-sm text-muted">
		<a href="/decks">← Cancel</a>
	</p>
</div>

<style>
	.page {
		padding: var(--spacing-lg);
		max-width: 36rem;
	}
</style>

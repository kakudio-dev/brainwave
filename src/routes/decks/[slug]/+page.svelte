<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import DeckEditor from '$lib/components/DeckEditor.svelte';
	import { fetchDeck, updateDeck, deleteDeck, type Deck } from '$lib/stores/decks';
	import { authUser, refreshAuth } from '$lib/stores/auth';

	const slug = $derived(page.params.slug!);

	let deck = $state<Deck | null>(null);
	let isOwner = $state(false);
	let loading = $state(true);
	let busy = $state(false);
	let serverError = $state<string | null>(null);
	let notFound = $state(false);
	let copied = $state(false);

	onMount(async () => {
		await refreshAuth();
		if (!$authUser || typeof $authUser !== 'object') {
			goto('/login');
			return;
		}
		await load();
	});

	async function load() {
		loading = true;
		const res = await fetchDeck(slug);
		loading = false;
		if (!res.ok) {
			if (res.status === 404) notFound = true;
			else serverError = res.error;
			return;
		}
		deck = res.deck;
		isOwner = res.isOwner;
	}

	async function submit(name: string, words: string[]) {
		busy = true;
		serverError = null;
		const result = await updateDeck(slug, { name, words });
		busy = false;
		if (!result.ok) {
			serverError = result.error;
			return;
		}
		deck = result.deck;
	}

	async function handleDelete() {
		if (!confirm('Delete this deck? This cannot be undone.')) return;
		busy = true;
		serverError = null;
		const result = await deleteDeck(slug);
		busy = false;
		if (!result.ok) {
			serverError = result.error ?? 'Failed to delete deck';
			return;
		}
		goto('/decks');
	}

	async function copyCode() {
		try {
			await navigator.clipboard.writeText(slug);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			/* ignore */
		}
	}
</script>

<div class="page">
	{#if loading}
		<div class="status">
			<div class="spinner"></div>
			<p class="mt-md">Loading…</p>
		</div>
	{:else if notFound}
		<h1>Deck not found</h1>
		<p class="text-muted mt-sm">
			Either the share code is wrong, or the owner deleted the deck.
		</p>
		<p class="mt-lg"><a href="/decks">← Back to my decks</a></p>
	{:else if deck}
		<div class="header">
			<h1>{isOwner ? 'Edit deck' : deck.name}</h1>
			<button class="share-code" onclick={copyCode} title="Click to copy">
				{copied ? '✓ Copied' : slug}
			</button>
		</div>

		{#if isOwner}
			<p class="text-secondary mt-sm">
				Anyone authenticated who knows this code can play with your deck.
			</p>

			<div class="mt-lg">
				<DeckEditor
					initialName={deck.name}
					initialWords={deck.words}
					submitLabel="Save changes"
					onSubmit={submit}
					onSecondary={handleDelete}
					secondaryLabel="Delete"
					{busy}
					{serverError}
				/>
			</div>
		{:else}
			<p class="text-secondary mt-sm">
				Shared with you. {deck.words.length} words.
			</p>
			<ul class="word-preview mt-lg">
				{#each deck.words as w}
					<li>{w}</li>
				{/each}
			</ul>
		{/if}

		<p class="mt-xl text-sm text-muted">
			<a href="/decks">← Back to my decks</a>
		</p>
	{/if}
</div>

<style>
	.page {
		padding: var(--spacing-lg);
		max-width: 36rem;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--spacing-md);
	}

	.share-code {
		background: var(--bg-card);
		color: var(--text-primary);
		border: 1px solid var(--bg-secondary);
		padding: var(--spacing-xs) var(--spacing-md);
		border-radius: var(--radius-sm);
		font-family: monospace;
		font-size: var(--text-base);
		cursor: pointer;
		letter-spacing: 0.1em;
	}

	.share-code:hover {
		background: var(--bg-secondary);
	}

	.word-preview {
		list-style: none;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
		gap: var(--spacing-xs);
		padding: var(--spacing-md);
		background: var(--bg-secondary);
		border-radius: var(--radius-md);
	}

	.word-preview li {
		padding: var(--spacing-xs) var(--spacing-sm);
	}
</style>

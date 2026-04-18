<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { myDecks, refreshMyDecks } from '$lib/stores/decks';
	import { authUser, refreshAuth } from '$lib/stores/auth';
	import { MAX_DECKS_PER_ACCOUNT } from '$lib/deckForm';

	onMount(async () => {
		await refreshAuth();
		if (!$authUser || typeof $authUser !== 'object') {
			goto('/login');
			return;
		}
		refreshMyDecks();
	});

	function formatDate(ms: number): string {
		return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

<div class="page">
	<div class="header">
		<h1>My decks</h1>
		<a class="btn btn--primary" href="/decks/new">+ New deck</a>
	</div>

	{#if $myDecks === null}
		<div class="status mt-lg">
			<div class="spinner"></div>
			<p class="mt-md">Loading…</p>
		</div>
	{:else if $myDecks.length === 0}
		<div class="empty mt-xl">
			<p class="text-secondary">You haven't made a deck yet.</p>
			<p class="text-sm text-muted mt-sm">
				Decks are lists of words your group guesses. Make one up for a party, a niche,
				or an inside joke — then use it in any game.
			</p>
			<a class="btn btn--primary mt-lg" href="/decks/new">Create your first deck</a>
		</div>
	{:else}
		<p class="text-muted text-sm mt-sm">
			{$myDecks.length} / {MAX_DECKS_PER_ACCOUNT} decks.
		</p>
		<ul class="deck-list mt-md">
			{#each $myDecks as deck (deck.slug)}
				<li class="deck-item">
					<a class="deck-link" href={`/decks/${deck.slug}`}>
						<div class="deck-main">
							<span class="deck-name">{deck.name}</span>
							<span class="deck-meta">
								{deck.word_count} words · code <code>{deck.slug}</code> · updated {formatDate(deck.updated_at)}
							</span>
						</div>
						<span class="chevron">›</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}

	<p class="mt-xl text-sm text-muted">
		<a href="/">← Back to home</a>
	</p>
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

	.empty {
		text-align: center;
		padding: var(--spacing-xl);
		background: var(--bg-secondary);
		border-radius: var(--radius-md);
	}

	.deck-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.deck-item {
		background: var(--bg-secondary);
		border-radius: var(--radius-md);
	}

	.deck-link {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--spacing-md);
		padding: var(--spacing-md);
		color: var(--text-primary);
		text-decoration: none;
	}

	.deck-link:hover {
		background: var(--bg-card);
	}

	.deck-main {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.deck-name {
		font-weight: 600;
	}

	.deck-meta {
		font-size: var(--text-sm);
		color: var(--text-muted);
	}

	.deck-meta code {
		background: var(--bg-card);
		padding: 1px 6px;
		border-radius: 4px;
		font-size: 0.9em;
	}

	.chevron {
		color: var(--text-muted);
		font-size: var(--text-xl);
	}
</style>

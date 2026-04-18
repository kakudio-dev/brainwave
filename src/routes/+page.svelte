<script lang="ts">
	import { goto } from '$app/navigation';
	import { authUser } from '$lib/stores/auth';
</script>

<div class="page page--centered">
	<div class="logo">
		<h1>Brainwave</h1>
		<p class="text-secondary">The word guessing party game</p>
	</div>

	<div class="spacer"></div>

	<div class="actions flex flex-col gap-md">
		<button class="btn btn--primary btn--large" onclick={() => goto('/create')}>
			Create Game
		</button>
		<button class="btn btn--secondary btn--large" onclick={() => goto('/join')}>
			Join Game
		</button>
		{#if $authUser && typeof $authUser === 'object'}
			<a class="btn btn--outline" href="/decks">My decks</a>
		{/if}
	</div>

	<div class="spacer"></div>

	<p class="text-muted text-sm">Get your friends together and start guessing!</p>
</div>

<style>
	.logo {
		margin-bottom: var(--spacing-2xl);
	}

	.logo h1 {
		font-size: var(--text-5xl);
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.actions {
		width: 100%;
		max-width: 20rem;
	}
</style>

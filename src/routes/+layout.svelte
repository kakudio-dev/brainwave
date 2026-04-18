<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { authUser, refreshAuth, logout } from '$lib/stores/auth';

	let { children } = $props();
	let menuOpen = $state(false);

	onMount(() => {
		refreshAuth();
	});

	async function handleLogout() {
		menuOpen = false;
		await logout();
	}
</script>

<div class="app">
	<header class="app-header">
		<a href="/" class="brand">Brainwave</a>
		<div class="auth-indicator">
			{#if $authUser && typeof $authUser === 'object'}
				<button class="auth-btn" onclick={() => (menuOpen = !menuOpen)}>
					{$authUser.email}
				</button>
				{#if menuOpen}
					<div class="auth-menu">
						<button class="auth-menu-item" onclick={handleLogout}>Sign out</button>
					</div>
				{/if}
			{:else if $authUser === null}
				<a href="/login" class="auth-btn">Sign in</a>
			{/if}
		</div>
	</header>
	{@render children()}
</div>

<style>
	.app-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--spacing-sm) var(--spacing-lg);
		border-bottom: 1px solid var(--bg-card);
		position: relative;
	}

	.brand {
		font-weight: 700;
		font-size: var(--text-lg);
		color: var(--color-primary);
		text-decoration: none;
	}

	.auth-indicator {
		position: relative;
	}

	.auth-btn {
		background: none;
		border: none;
		color: var(--text-secondary);
		font-size: var(--text-sm);
		cursor: pointer;
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		text-decoration: none;
	}

	.auth-btn:hover {
		background: var(--bg-secondary);
		color: var(--text-primary);
	}

	.auth-menu {
		position: absolute;
		right: 0;
		top: calc(100% + 4px);
		background: var(--bg-card);
		border-radius: var(--radius-md);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
		min-width: 10rem;
		z-index: 10;
		overflow: hidden;
	}

	.auth-menu-item {
		display: block;
		width: 100%;
		text-align: left;
		padding: var(--spacing-sm) var(--spacing-md);
		background: none;
		border: none;
		color: var(--text-primary);
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.auth-menu-item:hover {
		background: var(--bg-secondary);
	}
</style>

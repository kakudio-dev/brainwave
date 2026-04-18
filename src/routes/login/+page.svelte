<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { requestMagicLink, authUser, refreshAuth } from '$lib/stores/auth';

	let email = $state('');
	let submitting = $state(false);
	let sent = $state(false);
	let errorMessage = $state<string | null>(null);
	let devLink = $state<string | null>(null);

	const urlError = $derived(page.url.searchParams.get('error'));
	const errorFromUrl = $derived(
		urlError === 'invalid_link'
			? 'That sign-in link was invalid or expired. Request a new one below.'
			: urlError === 'missing_token'
				? 'That sign-in link was missing information. Request a new one below.'
				: null
	);

	onMount(async () => {
		// If already signed in, send them home.
		await refreshAuth();
		if ($authUser && typeof $authUser === 'object') {
			goto('/');
		}
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (submitting) return;
		submitting = true;
		errorMessage = null;
		devLink = null;

		const result = await requestMagicLink(email);
		submitting = false;

		if (!result.ok) {
			errorMessage = result.error ?? 'Something went wrong';
			return;
		}

		sent = true;
		if (result.devLink) devLink = result.devLink;
	}
</script>

<div class="page login-page">
	<h1>Sign in</h1>
	<p class="text-secondary mt-sm">
		Enter your email and we'll send you a one-click sign-in link.
	</p>

	{#if errorFromUrl}
		<div class="notice notice--error mt-lg">{errorFromUrl}</div>
	{/if}

	{#if sent}
		<div class="notice notice--success mt-lg">
			<p><strong>Check your email.</strong></p>
			<p class="text-sm mt-sm">
				We just sent a sign-in link to <strong>{email}</strong>. It expires in 15 minutes
				and can only be used once.
			</p>
			{#if devLink}
				<p class="text-sm mt-md text-muted">
					<em>Development mode:</em> no email was sent because no mail provider is
					configured. Click the link below to sign in:
				</p>
				<p class="mt-sm" style="overflow-wrap:anywhere">
					<a href={devLink}>{devLink}</a>
				</p>
			{/if}
			<button class="btn btn--secondary mt-md" onclick={() => { sent = false; devLink = null; }}>
				Use a different email
			</button>
		</div>
	{:else}
		<form onsubmit={submit} class="mt-lg">
			<label for="email" class="form-label">Email</label>
			<input
				id="email"
				type="email"
				bind:value={email}
				placeholder="you@example.com"
				required
				autocomplete="email"
				inputmode="email"
				class="form-input"
			/>
			{#if errorMessage}
				<p class="text-danger text-sm mt-sm">{errorMessage}</p>
			{/if}
			<button
				type="submit"
				class="btn btn--primary btn--large mt-md"
				disabled={submitting || email.length === 0}
			>
				{submitting ? 'Sending…' : 'Send me a sign-in link'}
			</button>
		</form>
	{/if}

	<p class="mt-xl text-sm text-muted">
		<a href="/">← Back to home</a>
	</p>
</div>

<style>
	.login-page {
		padding: var(--spacing-lg);
		max-width: 28rem;
	}

	.form-label {
		display: block;
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin-bottom: var(--spacing-xs);
	}

	.form-input {
		width: 100%;
		padding: var(--spacing-md);
		background: var(--bg-secondary);
		border: 2px solid transparent;
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-size: var(--text-base);
	}

	.form-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.notice {
		padding: var(--spacing-md);
		border-radius: var(--radius-md);
	}

	.notice--error {
		background: rgba(239, 68, 68, 0.12);
		border: 1px solid rgba(239, 68, 68, 0.35);
		color: var(--color-danger);
	}

	.notice--success {
		background: rgba(34, 197, 94, 0.12);
		border: 1px solid rgba(34, 197, 94, 0.35);
	}
</style>

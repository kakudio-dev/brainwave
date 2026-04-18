<script lang="ts">
	import {
		validateDeckForm,
		parseWordsFromText,
		MAX_DECK_NAME_LENGTH,
		MIN_WORDS_PER_DECK,
		MAX_WORDS_PER_DECK,
		MAX_WORD_LENGTH
	} from '$lib/deckForm';

	interface Props {
		// Initial name (empty for new, existing for edit).
		initialName?: string;
		// Initial words (array form). Will be joined with newlines in the textarea.
		initialWords?: string[];
		// Label for the submit button.
		submitLabel: string;
		// Called when user submits a valid form. Receives cleaned values.
		onSubmit: (name: string, words: string[]) => Promise<void> | void;
		// Optional secondary action (e.g. Delete on edit).
		onSecondary?: () => void;
		secondaryLabel?: string;
		busy?: boolean;
		serverError?: string | null;
	}

	let {
		initialName = '',
		initialWords = [],
		submitLabel,
		onSubmit,
		onSecondary,
		secondaryLabel,
		busy = false,
		serverError = null
	}: Props = $props();

	// Seed once from props. The editor mounts fresh per deck page, so we
	// intentionally don't react to subsequent prop changes (the user's
	// edits would get clobbered).
	let name = $state('');
	let wordsText = $state('');
	let localError = $state<string | null>(null);
	let seeded = $state(false);
	$effect(() => {
		if (!seeded) {
			name = initialName;
			wordsText = initialWords.join('\n');
			seeded = true;
		}
	});

	const parsedCount = $derived(parseWordsFromText(wordsText).length);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		const result = validateDeckForm(name, wordsText);
		if (!result.ok) {
			localError = result.error ?? 'Invalid form';
			return;
		}
		localError = null;
		await onSubmit(result.cleanedName!, result.cleanedWords!);
	}
</script>

<form onsubmit={handleSubmit} class="deck-editor">
	<div class="field">
		<label for="deck-name" class="form-label">Deck name</label>
		<input
			id="deck-name"
			type="text"
			bind:value={name}
			maxlength={MAX_DECK_NAME_LENGTH}
			placeholder="e.g. 90s Movies, Office Party, Dog Breeds"
			class="form-input"
			required
		/>
	</div>

	<div class="field">
		<label for="deck-words" class="form-label">
			Words
			<span class="text-muted text-sm">(one per line)</span>
		</label>
		<textarea
			id="deck-words"
			bind:value={wordsText}
			placeholder={`Titanic\nAvatar\nStar Wars\n...`}
			class="form-input deck-textarea"
			rows="14"
		></textarea>
		<p class="text-sm text-muted mt-xs">
			{parsedCount} words.
			Need {MIN_WORDS_PER_DECK}–{MAX_WORDS_PER_DECK}, up to {MAX_WORD_LENGTH} characters each.
			Duplicates are ignored.
		</p>
	</div>

	{#if localError}
		<p class="text-danger text-sm">{localError}</p>
	{/if}
	{#if serverError}
		<p class="text-danger text-sm">{serverError}</p>
	{/if}

	<div class="actions">
		<button type="submit" class="btn btn--primary" disabled={busy}>
			{busy ? 'Saving…' : submitLabel}
		</button>
		{#if onSecondary && secondaryLabel}
			<button type="button" class="btn btn--secondary" onclick={onSecondary} disabled={busy}>
				{secondaryLabel}
			</button>
		{/if}
	</div>
</form>

<style>
	.deck-editor {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.field {
		display: flex;
		flex-direction: column;
	}

	.form-label {
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
		font-family: inherit;
	}

	.form-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.deck-textarea {
		resize: vertical;
		min-height: 14rem;
	}

	.actions {
		display: flex;
		gap: var(--spacing-md);
		flex-wrap: wrap;
	}

	.mt-xs {
		margin-top: var(--spacing-xs);
	}
</style>

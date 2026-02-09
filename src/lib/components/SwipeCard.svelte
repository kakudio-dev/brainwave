<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		onCorrect: () => void;
		onPass: () => void;
		children?: Snippet;
	}

	let { onCorrect, onPass, children }: Props = $props();

	let startX = 0;
	let currentX = 0;
	let isDragging = $state(false);
	let cardElement: HTMLDivElement;

	const SWIPE_THRESHOLD = 80;

	function handleTouchStart(e: TouchEvent) {
		startX = e.touches[0].clientX;
		isDragging = true;
	}

	function handleTouchMove(e: TouchEvent) {
		if (!isDragging) return;
		currentX = e.touches[0].clientX - startX;
		if (cardElement) {
			cardElement.style.transform = `translateX(${currentX}px) rotate(${currentX * 0.05}deg)`;
		}
	}

	function handleTouchEnd() {
		if (!isDragging) return;
		isDragging = false;

		if (currentX > SWIPE_THRESHOLD) {
			triggerCorrect();
		} else if (currentX < -SWIPE_THRESHOLD) {
			triggerPass();
		} else {
			resetCard();
		}
	}

	function handleMouseDown(e: MouseEvent) {
		startX = e.clientX;
		isDragging = true;
		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isDragging) return;
		currentX = e.clientX - startX;
		if (cardElement) {
			cardElement.style.transform = `translateX(${currentX}px) rotate(${currentX * 0.05}deg)`;
		}
	}

	function handleMouseUp() {
		window.removeEventListener('mousemove', handleMouseMove);
		window.removeEventListener('mouseup', handleMouseUp);
		handleTouchEnd();
	}

	function resetCard() {
		currentX = 0;
		if (cardElement) {
			cardElement.style.transition = 'transform 0.3s ease';
			cardElement.style.transform = 'translateX(0) rotate(0)';
			setTimeout(() => {
				if (cardElement) cardElement.style.transition = '';
			}, 300);
		}
	}

	function triggerCorrect() {
		if (cardElement) {
			cardElement.style.transition = 'transform 0.3s ease';
			cardElement.style.transform = 'translateX(100vw) rotate(20deg)';
		}
		setTimeout(() => {
			onCorrect();
			resetCard();
		}, 150);
	}

	function triggerPass() {
		if (cardElement) {
			cardElement.style.transition = 'transform 0.3s ease';
			cardElement.style.transform = 'translateX(-100vw) rotate(-20deg)';
		}
		setTimeout(() => {
			onPass();
			resetCard();
		}, 150);
	}

	let swipeIndicator = $derived(
		currentX > SWIPE_THRESHOLD ? 'correct' :
		currentX < -SWIPE_THRESHOLD ? 'pass' :
		null
	);
</script>

<div class="swipe-container">
	<div
		class="swipe-card"
		bind:this={cardElement}
		ontouchstart={handleTouchStart}
		ontouchmove={handleTouchMove}
		ontouchend={handleTouchEnd}
		onmousedown={handleMouseDown}
		role="button"
		tabindex="0"
	>
		{#if swipeIndicator === 'correct'}
			<div class="swipe-indicator correct">Correct!</div>
		{:else if swipeIndicator === 'pass'}
			<div class="swipe-indicator pass">Pass</div>
		{/if}

		{@render children?.()}
	</div>

	<div class="swipe-hint">
		<span>&larr; Pass</span>
		<span>Correct &rarr;</span>
	</div>

	<div class="button-controls mt-lg">
		<button class="btn btn--danger" onclick={triggerPass}>
			Pass
		</button>
		<button class="btn btn--success" onclick={triggerCorrect}>
			Correct
		</button>
	</div>
</div>

<style>
	.swipe-container {
		width: 100%;
		touch-action: pan-y;
		user-select: none;
	}

	.swipe-card {
		cursor: grab;
		position: relative;
	}

	.swipe-card:active {
		cursor: grabbing;
	}

	.swipe-indicator {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: var(--text-3xl);
		font-weight: 800;
		z-index: 10;
		padding: var(--spacing-md) var(--spacing-xl);
		border-radius: var(--radius-lg);
		pointer-events: none;
	}

	.swipe-indicator.correct {
		color: var(--color-success);
		background: rgba(34, 197, 94, 0.2);
		border: 3px solid var(--color-success);
	}

	.swipe-indicator.pass {
		color: var(--color-danger);
		background: rgba(239, 68, 68, 0.2);
		border: 3px solid var(--color-danger);
	}

	.button-controls {
		display: flex;
		gap: var(--spacing-md);
	}

	.button-controls .btn {
		flex: 1;
	}
</style>

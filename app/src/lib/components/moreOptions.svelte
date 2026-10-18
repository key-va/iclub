<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label?: string;
		timeout?: number;
		children: Snippet;
	}

	let { label = 'more', timeout = 9000, children }: Props = $props();

	let open = $state(false);
	// bumped on any interaction so the countdown restarts while the options are in use
	let activity = $state(0);

	$effect(() => {
		if (!open) return;

		activity;

		const timer = setTimeout(() => (open = false), timeout);

		return () => clearTimeout(timer);
	});
</script>

<div class="row right">
	{#if open}
		<div
			class="options"
			role="group"
			aria-label={`${label} options`}
			onpointerdown={() => activity++}
			onfocusin={() => activity++}
		>
			{@render children()}
		</div>
	{:else}
		<button
			class="blue"
			aria-label={label}
			aria-expanded="false"
			onclick={() => (open = true)}
		>
			<p>{label}</p>
			<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
				<path d="M12 5v14M5 12h14" />
			</svg>
		</button>
	{/if}
</div>

<style>
	.options {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		white-space: nowrap;
	}
</style>

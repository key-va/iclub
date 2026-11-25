<script lang="ts">
	import ActionConfirmation from './ActionConfirmation.svelte';

	let { href, name = 'edit', confirm = true }: {
		href: string;
		name?: string;
		confirm?: boolean;
	} = $props();
</script>

{#if confirm}
	<ActionConfirmation inline arrow showLabel {name}
		action={async () => ({ success: true, message: '', subject: href })} />
{:else}
	<a class="action-link blue" {href}>
		<p>{name}</p>
		<svg class="action-arrow" viewBox="0 0 24 24" width="1rem" height="1rem"
			fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"
			stroke-linejoin="round" aria-hidden="true">
			<path d="M5 12h14M13 5l7 7-7 7" />
		</svg>
	</a>
{/if}

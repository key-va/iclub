<script lang="ts">
	import SummaryHelp from '#lib/components/SummaryHelp.svelte';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import { page } from '$app/state';
	import { entityOf } from '#lib/stores/guids.ts';

	const bot = $derived(entityOf(page.params.bot_id ?? ''));
</script>

<div class="page">
	<EntityHeader entity={bot} title="Bot" subtitle="bot" />

	{#if bot}
		<SummaryHelp>
			<p class="info center">{bot.name} is a system automation account.</p>
			{#snippet help()}
				<p class="info">This account takes automated actions to enforce rules such as match time limits and forfeits.</p>
			{/snippet}
		</SummaryHelp>
	{/if}
</div>

<style>
	.page {
		width: 100%;
	}
</style>

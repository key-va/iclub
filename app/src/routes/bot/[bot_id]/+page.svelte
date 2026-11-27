<script lang="ts">
	import HelpText from '#lib/components/HelpText.svelte';
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
			{#snippet help()}<HelpText topic="feature.bot" />{/snippet}
		</SummaryHelp>
	{/if}
</div>

<style>
	.page {
		width: 100%;
	}
</style>

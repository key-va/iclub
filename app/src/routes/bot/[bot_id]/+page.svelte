<script lang="ts">
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import { page } from '$app/state';
	import { guids, entityOf } from '#lib/stores/guids.ts';

	const bot = $derived(entityOf($guids.items, page.params.bot_id ?? ''));
</script>

<div class="page">
	<EntityHeader entity={bot} title={bot?.name ?? 'Bot'} subtitle="bot" />

	{#if bot}
		<div class="group">
			<div class="row center">
				<p>{bot.name} is a system automation account. It takes actions necessary to enforce rules such as timeout violations and forfeits.</p>
			</div>
		</div>
	{/if}
</div>

<style>
	.page {
		width: 100%;
	}
</style>

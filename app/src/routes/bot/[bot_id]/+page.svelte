<script lang="ts">
	import EntityActions from '#lib/components/EntityActions.svelte';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import { page } from '$app/state';
	import { entityOf } from '#lib/stores/guids.ts';

	const bot = $derived(entityOf(page.params.bot_id ?? ''));
</script>

<div class="page">
	<EntityHeader entity={bot} title="Bot" subtitle="bot" />
	<EntityActions>
		{#snippet help()}<p class="info">Bot accounts perform automated actions for Intra Club.</p>{/snippet}
	</EntityActions>

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

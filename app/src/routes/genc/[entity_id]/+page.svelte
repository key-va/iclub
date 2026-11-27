<script lang="ts">
	import HelpText from '#lib/components/HelpText.svelte';
	import SummaryHelp from '#lib/components/SummaryHelp.svelte';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import { page } from '$app/state';
	import { local } from '#lib/stores/local.ts';
	import {
		guids,
		entityOf,
		hrefOf,
		imageOf,
		relationsOf,
		nameOf,
		typeOf
	} from '#lib/stores/guids.ts';

	import RouteLink from '#lib/components/routeLink.svelte';

	const { caller_id, device_id } = $local;

	const entityId = $derived(page.params.entity_id ?? '');
	const entity = $derived(entityOf(entityId));
	const relatedRows = $derived(relationsOf(entityId));
</script>

<div class="page">
	{#if entity}
		<EntityHeader {entity} />
		<SummaryHelp summary="related items">
			{#snippet help()}<HelpText topic="feature.genc" />{/snippet}
		</SummaryHelp>
	{:else}
		<div class="row right">
			<p class="truncate">
				<strong>{$guids.loaded ? 'Not found' : 'Loading'}</strong><br />entity
			</p>
			<div class="blank-icon-small"></div>
		</div>
	{/if}

	{#if relatedRows.length > 0}
		{#each relatedRows as related_entity}
			<RouteLink
				href={hrefOf(related_entity.rk)}
				title={nameOf(related_entity.rk)}
				description={typeOf(related_entity.rk)}
				isWhite={related_entity.rk === caller_id}
				image={imageOf(related_entity.rk)}
			/>
		{/each}
	{:else}
		<RouteLink
			href={`/`}
			title="None"
			description="no relations found"
			isWhite={false}
		/>
	{/if}
</div>

<style>
	.page {
		width: 100%;
	}
</style>

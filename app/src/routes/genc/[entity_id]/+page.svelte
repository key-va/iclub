<script lang="ts">
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import { page } from '$app/state';
	import { local } from '#lib/stores/local.ts';
	import { guids, entityOf, relatedEntities, hrefOf, imageOf } from '#lib/stores/guids.ts';

    import RouteLink from '#lib/components/routeLink.svelte';

	const { caller_id, device_id } = $local;

	const entityId = $derived(page.params.entity_id ?? '');
	const entity = $derived(entityOf($guids.items, entityId));
	const related_entities = $derived(relatedEntities($guids.items, entityId));
</script>

<div class="page">
	{#if entity}
		<EntityHeader {entity} subtitle="entity" />
	{:else}
		<div class="row right">
			<p class="truncate"><strong>{$guids.loaded ? 'Not found' : 'Loading'}</strong><br />entity</p>
			<div class="blank-icon-small"></div>
		</div>
	{/if}


	{#if related_entities.length > 0}
		{#each related_entities as related_entity}
			<RouteLink
				href={hrefOf(related_entity.rk)}
				title={related_entity.name??'no name'}
				description={related_entity.pk}
				isWhite={related_entity.rk === caller_id}
				image={imageOf(related_entity.rk)}
			/>
		{/each}
	{:else}
		<RouteLink
			href={`/`}
			title='None'
			description='no relations found'
			isWhite={false}
		/>
	{/if}

</div>

<style>
	.page {
		width: 100%;
	}
</style>

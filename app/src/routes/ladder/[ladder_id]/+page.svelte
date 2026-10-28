<script lang="ts">
	import { page } from '$app/state';
	import { PUBLIC_URL } from '#lib/config.ts';
	import { local } from '#lib/stores/local.ts';
	import { guids, entityOf, relatedEntities } from '#lib/stores/guids.ts';
	import { ladderSettings } from '#lib/strings.ts';

	import GencRouteLink from '#lib/components/gencRouteLink.svelte';

	const { caller_id } = $local;

	const ladderId = $derived(page.params.ladder_id ?? '');
	const ladder = $derived(entityOf($guids.items, ladderId));
	const related_entities = $derived(relatedEntities($guids.items, ladderId));
</script>

<div class="page">
	{#if ladder}
		<div class="row right">
			<p class="truncate"><strong>{ladder.name}</strong><br />{ladder.pk}</p>
			<div class="blank-icon-small"></div>
		</div>

		<div class="row center">
			<div class="round-icon-big" style="background-image: url('{PUBLIC_URL}/{ladder.rk}.jpg');"></div>
		</div>

		{#each Object.entries(ladderSettings) as [key, setting] (key)}
			<GencRouteLink
				href={`/ladder/${ladderId}`}
				title={String(ladder[key] ?? setting.default)}
				description={setting.label}
				isWhite={false}
			/>
		{/each}

		{#each related_entities as related_entity}
			<GencRouteLink
				href={`/genc/${related_entity.rk}`}
				title={related_entity.name ?? 'no name'}
				description={related_entity.pk}
				isWhite={related_entity.rk === caller_id}
				image={PUBLIC_URL + '/' + related_entity.rk + '.jpg'}
			/>
		{/each}
	{:else}
		<div class="row right">
			<p class="truncate"><strong>{$guids.loaded ? 'Not found' : 'Loading'}</strong><br />ladder</p>
			<div class="blank-icon-small"></div>
		</div>
	{/if}
</div>

<style>
	.page {
		width: 100%;
	}
</style>

<script lang="ts">
	import { page } from '$app/state';
	import { PUBLIC_URL } from '#lib/config.ts';
	import { guids, entityOf } from '#lib/stores/guids.ts';

	import GencEntityCard from '#lib/components/gencEntityCard.svelte';

	const entityId = $derived(page.params.entity_id ?? '');
	const entity = $derived(entityOf($guids.items, entityId));
</script>

<div class="page">
	{#if entity}
		<div class="row right">
			<p class="truncate"><strong>{entity.name}</strong><br />entity</p>
			<div class="blank-icon-small"></div>
		</div>

		<div class="row center">
			<div class="round-icon-big" style="background-image: url('{PUBLIC_URL}/{entity.rk}.jpg');"></div>
		</div>
	{:else}
		<div class="row right">
			<p class="truncate"><strong>{$guids.loaded ? 'Not found' : 'Loading'}</strong><br />entity</p>
			<div class="blank-icon-small"></div>
		</div>
	{/if}

</div>

<style>
	.page {
		width: 100%;
	}
</style>

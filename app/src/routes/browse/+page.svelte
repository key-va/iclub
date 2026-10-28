<script lang="ts">
	import { PUBLIC_URL } from '#lib/config.ts';
	import { local } from '#lib/stores/local.ts';
	import { entities } from '#lib/stores/guids.ts';

	import GencRouteLink from '#lib/components/gencRouteLink.svelte';

	const { caller_id, device_id } = $local;
    
	let filter = $state('');
	function clearFilter() { filter = ''; }

	const filtered = $derived.by(() => {
		const q = filter.trim().toLowerCase();
		if (!q) return $entities;
		return $entities.filter((e) => `${e.name ?? ''} ${e.pk}`.toLowerCase().includes(q));
	});

</script>

<div class="page">
	<div class="row right">
		<p class="truncate"><strong>Intra Club</strong><br />browse</p>
		<div class="blank-icon-small"></div>
	</div>

	<div class="row center">
		<div class="round-icon-big" style="background-image: url('/favicons/icon-512.png');"></div>
	</div>

    <div class="row right white">
		<input
			type="text"
			placeholder="filter"
			autocomplete="off"
			bind:value={filter}
		/>
		<button aria-label="Filter" onclick={() => clearFilter()}>
			<svg viewBox="0 0 24 24" width="1rem" height="1rem" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" role="img">
				<path d="M18 6 6 18M6 6l12 12" />
			</svg>
		</button>
	</div>

	{#each filtered as entity (entity.rk)}
		<GencRouteLink
			href={`/genc/${entity.rk}`}
			title={entity.name??'no name'}
			description={entity.pk}
			isWhite={entity.rk === caller_id}
			image={PUBLIC_URL + '/' + entity.rk + '.jpg'}
		/>
	{/each}
    
</div>

<style>
	.page {
		width: 100%;
	}
</style>

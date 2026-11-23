<script lang="ts">
	import { branding } from '#lib/stores/branding.ts';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import { local } from '#lib/stores/local.ts';
	import { entities, hrefOf, imageOf, isBrowsableEntity } from '#lib/stores/guids.ts';

	import RouteLink from '#lib/components/routeLink.svelte';

	const { caller_id, device_id } = $local;

	let filter = $state('');
	function clearFilter() {
		filter = '';
	}

	const browsable = $derived($entities.filter(isBrowsableEntity));

	const filtered = $derived.by(() => {
		const q = filter.trim().toLowerCase();
		if (!q) return browsable;
		return browsable.filter((e) =>
			`${e.name ?? ''} ${e.pk}`.toLowerCase().includes(q)
		);
	});
</script>

<div class="page">
	<EntityHeader
		title={$branding.name}
		subtitle="browse"
		image={$branding.icon}
	/>

	<div class="group">
		<div class="row right">
			<input
				type="text"
				placeholder="filter"
				autocomplete="off"
				bind:value={filter}
			/>
			<button aria-label="Filter" onclick={() => clearFilter()}>
				<svg
					viewBox="0 0 24 24"
					width="1rem"
					height="1rem"
					fill="none"
					stroke="currentColor"
					stroke-width="3"
					stroke-linecap="round"
					stroke-linejoin="round"
					role="img"
				>
					<path d="M18 6 6 18M6 6l12 12" />
				</svg>
			</button>
		</div>
	</div>

	{#each filtered.filter((e) => e.pk === 'ladder') as entity (entity.rk)}
		<RouteLink
			href={hrefOf(entity.rk)}
			title={entity.name ?? 'no name'}
			description={entity.pk}
			image={imageOf(entity.rk)}
		/>
	{/each}

	{#each filtered.filter((e) => e.pk === 'team') as entity (entity.rk)}
		<RouteLink
			href={hrefOf(entity.rk)}
			title={entity.name ?? 'no name'}
			description={entity.pk}
			image={imageOf(entity.rk)}
		/>
	{/each}

	{#each filtered.filter((entity) => ['group', 'comp'].includes(entity.pk)) as entity (entity.rk)}
		<RouteLink
			href={hrefOf(entity.rk)}
			title={entity.name ?? 'no name'}
			description={entity.pk}
			image={imageOf(entity.rk)}
		/>
	{/each}

	{#if caller_id && device_id && filter.trim() && filtered.length === 0}
		<RouteLink
			href={`/ladder/create?name=${encodeURIComponent(filter.trim())}`}
			title="New Ladder"
			description="create a new ladder"
		/>
		<RouteLink
			href="/team/create"
			title="New Team"
			description="create a new team"
		/>
		<RouteLink
			href={`/group/create?name=${encodeURIComponent(filter.trim())}`}
			title="New Group"
			description="create a new group"
		/>
		<RouteLink
			href={`/comp/create?name=${encodeURIComponent(filter.trim())}`}
			title="New Competition"
			description="create a new comp"
		/>
	{/if}
</div>

<style>
	.page {
		width: 100%;
	}
</style>

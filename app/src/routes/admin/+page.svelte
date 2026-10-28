<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { PUBLIC_URL } from '#lib/config.ts';
	import { guids, relatedEntities } from '#lib/stores/guids.ts';
	import { local } from '#lib/stores/local.ts';

	import GencRouteLink from '#lib/components/gencRouteLink.svelte';

	const ownedLadders = $derived(
		relatedEntities($guids.items, $local.caller_id ?? '', 'ladder').filter(
			(ladder) => ladder.relation.isAdmin === true
		)
	);

	onMount(() => {
		if (!$local.caller_id || !$local.device_id) goto('/login', { replaceState: true });
	});
</script>

<div class="page">
	<div class="row right">
		<p class="truncate"><strong>Intra Club</strong><br />admin</p>
		<div class="blank-icon-small"></div>
	</div>

	<div class="row center">
		<div class="round-icon-big" style="background-image: url('/favicons/icon-512.png');"></div>
	</div>

	{#each ownedLadders as ladder (ladder.rk)}
		<GencRouteLink
			href={`/ladder/${ladder.rk}/edit`}
			title={ladder.name ?? 'no name'}
			description="edit your ladder"
			isWhite={true}
			image={`${PUBLIC_URL}/${ladder.rk}.jpg`}
		/>
	{/each}

	<GencRouteLink href="/ladder/create" title="Create ladder" description="start a new ladder" isWhite={false} />
</div>

<style>
	.page {
		width: 100%;
	}
</style>

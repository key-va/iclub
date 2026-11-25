<script lang="ts">
	import { entityOf, hrefOf, imageOf, nameOf, relationsOf, typeOf } from '#lib/stores/guids.ts';
	import RouteLink from '../routeLink.svelte';

	let { pairId }: { pairId: string } = $props();
	const members = $derived(relationsOf(pairId).filter((row) =>
		typeOf(row.rk) === 'user' && row.role === 'member' && entityOf(row.rk)
	));
</script>

{#each members as member (member.rk)}
	<RouteLink
		href={hrefOf(member.rk)}
		title={nameOf(member.rk)}
		description="member"
		image={imageOf(member.rk)}
	/>
{/each}

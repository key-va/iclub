<script lang="ts">
	import { local } from '#lib/stores/local.ts';
	import {
		relationsOf,
		nameOf,
		hrefOf,
		type GuidRow
	} from '#lib/stores/guids.ts';
	import MatchActions from './MatchActions.svelte';
	import RouteLinkHiddenAction from '../RouteLinkHiddenAction.svelte';
	let { match }: { match: GuidRow } = $props();
	const mine = $derived(
		relationsOf(match.rk).find((row) => row.rk === $local.caller_id)
	);
	const ladder = $derived(
		relationsOf(match.rk).find((row) => row.rk.startsWith('ladder_'))
	);
	const admin = $derived(
		!!ladder &&
			relationsOf(ladder.rk).some(
				(row) => row.rk === $local.caller_id && row.is_admin === true
			)
	);
	const actionable = $derived(
		['pending', 'active'].includes(String(match.state)) &&
			((!!mine &&
				['challenger', 'defender', 'participant'].includes(
					String(mine.role)
				)) ||
				(match.state === 'pending' && admin))
	);
</script>

{#snippet actions()}<MatchActions {match} quick />{/snippet}
<RouteLinkHiddenAction
	href={hrefOf(match.rk)}
	title={nameOf(match.rk)}
	description={`${match.state} match`}
	colour="orange"
	children={actionable ? actions : undefined}
/>

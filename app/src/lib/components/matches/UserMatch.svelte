<script lang="ts">
	import { local } from '#lib/stores/local.ts';
	import {
		nameOf,
		hrefOf,
		relationsOf,
		type GuidRow
	} from '#lib/stores/guids.ts';
	import { canAcceptLadderMatch, isMatchDefender } from './matchRules.ts';
	import MatchActions from './MatchActions.svelte';
	import RouteLinkHiddenAction from '../RouteLinkHiddenAction.svelte';
	let { match }: { match: GuidRow } = $props();
	const needsMyAcceptance = $derived(canAcceptLadderMatch(match, $local.caller_id) && isMatchDefender(relationsOf(match.rk), $local.caller_id));
	const active = $derived(match.state === 'active');
</script>

{#snippet actions()}<MatchActions {match} quick />{/snippet}
<RouteLinkHiddenAction
	href={hrefOf(match.rk)}
	title={nameOf(match.rk)}
	description={`${match.state} match`}
	colour={active ? 'green' : needsMyAcceptance ? 'red' : 'orange'}
	children={actions}
/>

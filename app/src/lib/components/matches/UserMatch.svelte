<script lang="ts">
	import { local } from '#lib/stores/local.ts';
	import {
		nameOf,
		hrefOf,
		relationsOf,
		type GuidRow
	} from '#lib/stores/guids.ts';
	import { isMatchSide } from './matchRules.ts';
	import MatchActions from './MatchActions.svelte';
	import RouteLinkHiddenAction from '../RouteLinkHiddenAction.svelte';
	let { match }: { match: GuidRow } = $props();
	const links = $derived(relationsOf(match.rk));
	const pendingLadder = $derived(match.state === 'pending' && links.some(row => row.rk.startsWith('ladder_')));
	const needsMyAcceptance = $derived(pendingLadder && isMatchSide(links, $local.caller_id, 'defender'));
	const hasActions = $derived(needsMyAcceptance || (pendingLadder && isMatchSide(links, $local.caller_id, 'challenger')));
	const active = $derived(match.state === 'active');
</script>

{#snippet actions()}<MatchActions {match} quick />{/snippet}
<RouteLinkHiddenAction
	href={hrefOf(match.rk)}
	title={nameOf(match.rk)}
	description={`${match.state} match`}
	colour={active ? 'green' : needsMyAcceptance ? 'red' : 'orange'}
	children={hasActions ? actions : undefined}
	currentSelection={hasActions ? undefined : 'no actions'}
/>

<script lang="ts">
	import { local } from '#lib/stores/local.ts';
	import {
		nameOf,
		hrefOf,
		type GuidRow
	} from '#lib/stores/guids.ts';
	import { canAcceptLadderMatch } from './matchRules.ts';
	import MatchActions from './MatchActions.svelte';
	import RouteLinkHiddenAction from '../RouteLinkHiddenAction.svelte';
	let { match }: { match: GuidRow } = $props();
	const actionable = $derived(canAcceptLadderMatch(match, $local.caller_id));
</script>

{#snippet actions()}<MatchActions {match} quick />{/snippet}
<RouteLinkHiddenAction
	href={hrefOf(match.rk)}
	title={nameOf(match.rk)}
	description={`${match.state} match`}
	colour="orange"
	children={actionable ? actions : undefined}
/>

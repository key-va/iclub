<script lang="ts">
	import { local } from '#lib/stores/local.ts';
	import { entityOf, relationsOf, type GuidRow } from '#lib/stores/guids.ts';
	import { acceptMatch, forfeitCompetitionMatch, forfeitMatch } from '#lib/stores/remote.ts';
	import { competitionSlots } from '../competitions/competitionBracket.ts';
	import { canAcceptLadderMatch, canForfeitCompetitionMatch } from './matchRules.ts';
	import EntityActions from '../EntityActions.svelte';
	import ActionQuick from '../ActionQuick.svelte';
	import ActionConfirmation from '../ActionConfirmation.svelte';
	let {
		match,
		quick = false,
		section = 'all',
		forfeitData = {}
	}: {
		match: GuidRow;
		quick?: boolean;
		section?: 'all' | 'primary' | 'options';
		forfeitData?: Record<string, unknown>;
	} = $props();
	const links = $derived(relationsOf(match.rk));
	const comp = $derived(links.find((row) => row.rk.startsWith('comp_')));
	const doublesComp = $derived(!!comp && entityOf(comp.rk)?.format === 'doubles');
	const mine = $derived(links.find((row) => row.rk === $local.caller_id));
	const canAccept = $derived(canAcceptLadderMatch(match, $local.caller_id));
	const forfeitRelevant = $derived(
		comp ? (match.state === 'active' || match.state === 'waiting') &&
			!!mine && ['competitor', 'participant'].includes(String(mine.role))
		: ['pending', 'active'].includes(String(match.state)) &&
			!!mine && ['challenger', 'defender', 'participant'].includes(String(mine.role))
	);
	const canForfeit = $derived(
		comp ? canForfeitCompetitionMatch(match, $local.caller_id) :
		['pending', 'active'].includes(String(match.state)) &&
			!!mine &&
			['challenger', 'defender', 'participant'].includes(String(mine.role))
	);
	function forfeit() {
		const [first, second] = comp ? competitionSlots(match) : [];
		return comp
			? forfeitCompetitionMatch(comp.rk, match.rk, first!.rk, second!.rk)
			: forfeitMatch(match.rk, forfeitData);
	}
</script>

{#snippet quickButtons()}
	{#if canAccept}<ActionQuick
			inline
			name="accept"
			action={() => acceptMatch(match.rk)}
		/>{/if}
{/snippet}
{#snippet acceptButton()}<ActionConfirmation
		inline
		arrow
		showLabel
		name="accept"
		action={() => acceptMatch(match.rk)}
	/>{/snippet}
{#snippet forfeitOption()}<ActionConfirmation
		inline
		arrow
		showLabel
		name="forfeit"
		message={doublesComp ? "Forfeit for your pair? The opposing pair will win this match." : "Forfeit this match?"}
		action={forfeit}
		disabled={!canForfeit}
	/>{/snippet}
{#if canAccept || forfeitRelevant}
	{#if quick}{@render quickButtons()}
	{:else}<EntityActions
			{section}
			children={canAccept ? acceptButton : undefined}
			options={forfeitRelevant ? forfeitOption : undefined}
		/>{/if}
{/if}

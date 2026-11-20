<script lang="ts">
	import { local } from '#lib/stores/local.ts';
	import { relationsOf, type GuidRow } from '#lib/stores/guids.ts';
	import { acceptMatch, forfeitCompetitionMatch, forfeitMatch } from '#lib/stores/remote.ts';
	import { canForfeitCompetitionMatch } from './matchRules.ts';
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
	const mine = $derived(links.find((row) => row.rk === $local.caller_id));
	const ladder = $derived(links.find((row) => row.rk.startsWith('ladder_')));
	const admin = $derived(
		!!ladder &&
			relationsOf(ladder.rk).some(
				(row) => row.rk === $local.caller_id && row.is_admin === true
			)
	);
	const defender = $derived(links.find((row) => row.role === 'defender'));
	const onDefendingSide = $derived(
		mine?.role === 'defender' ||
			(mine?.competitor_id === defender?.rk && !!defender)
	);
	const canAccept = $derived(
		!comp && match.state === 'pending' && (onDefendingSide || admin)
	);
	const canForfeit = $derived(
		comp ? canForfeitCompetitionMatch(match, $local.caller_id) :
		['pending', 'active'].includes(String(match.state)) &&
			!!mine &&
			['challenger', 'defender', 'participant'].includes(String(mine.role))
	);
	function forfeit() {
		return comp
			? forfeitCompetitionMatch(comp.rk, match.rk, String(match.first_id), String(match.second_id))
			: forfeitMatch(match.rk, forfeitData);
	}
</script>

{#snippet quickButtons()}
	{#if canAccept}<ActionQuick
			inline
			name="accept"
			action={() => acceptMatch(match.rk)}
		/>{/if}
	{#if canForfeit}<ActionQuick
			inline
			name="forfeit"
			action={forfeit}
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
		message="Forfeit this match?"
		action={forfeit}
	/>{/snippet}
{#if canAccept || canForfeit}
	{#if quick}{@render quickButtons()}
	{:else}<EntityActions
			{section}
			children={canAccept ? acceptButton : undefined}
			options={canForfeit ? forfeitOption : undefined}
		/>{/if}
{/if}

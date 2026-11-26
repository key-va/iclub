<script lang="ts">
	import { local } from '#lib/stores/local.ts';
	import { relationsOf, type GuidRow } from '#lib/stores/guids.ts';
	import { acceptMatch, forfeitCompetitionMatch, forfeitMatch, withdrawMatch } from '#lib/stores/remote.ts';
	import { competitionSlots } from '../competitions/competitionBracket.ts';
	import { canAcceptLadderMatch, canForfeitCompetitionMatch, isMatchSide } from './matchRules.ts';
	import EntityActions from '../EntityActions.svelte';
	import ActionQuick from '../ActionQuick.svelte';
	import ActionConfirmation from '../ActionConfirmation.svelte';
	let {
		match,
		quick = false,
		inline = false,
		section = 'all',
		forfeitData = {}
	}: {
		match: GuidRow;
		quick?: boolean;
		inline?: boolean;
		section?: 'all' | 'primary' | 'options';
		forfeitData?: Record<string, unknown>;
	} = $props();
	const links = $derived(relationsOf(match.rk));
	const comp = $derived(links.find((row) => row.rk.startsWith('comp_')));
	const mine = $derived(links.find((row) => row.rk === $local.caller_id));
	const pendingLadder = $derived(match.state === 'pending' && links.some(row => row.rk.startsWith('ladder_')));
	const canWithdraw = $derived(pendingLadder && isMatchSide(links, $local.caller_id, 'challenger'));
	const canAccept = $derived(canAcceptLadderMatch(match, $local.caller_id));
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
	<ActionQuick inline name="accept"
		disabled={!pendingLadder || !isMatchSide(links, $local.caller_id, 'defender')}
		action={() => acceptMatch(match.rk)}
	/>
	{@render withdrawButton()}
{/snippet}
{#snippet withdrawButton()}
	<ActionQuick inline name="withdraw" arrow={!quick}
		disabled={!canWithdraw}
		action={() => withdrawMatch(match.rk)}
	/>
{/snippet}
{#snippet acceptButton()}<ActionConfirmation
		inline
		arrow
		showLabel
		name="accept"
		message={`accept ${match.name}?`}
		action={() => acceptMatch(match.rk)}
	/>{/snippet}
{#snippet primaryButtons()}
	{#if canAccept}{@render acceptButton()}{/if}
	{#if canWithdraw}{@render withdrawButton()}{/if}
{/snippet}
{#snippet forfeitOption()}<ActionConfirmation
		inline
		arrow
		showLabel
		name="forfeit"
		message={`forfeit ${match.name}?`}
		action={forfeit}
	/>{/snippet}
{#if quick}
	{@render quickButtons()}
{:else if inline}
	{@render primaryButtons()}
{:else if canAccept || canWithdraw || canForfeit}
	<EntityActions
			{section}
			children={canAccept || canWithdraw ? primaryButtons : undefined}
			options={canForfeit ? forfeitOption : undefined}
		/>
{/if}

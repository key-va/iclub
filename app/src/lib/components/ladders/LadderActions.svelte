<script lang="ts">
	import HelpText from '#lib/components/HelpText.svelte';
	import RejectCreationRequest from '#lib/components/RejectCreationRequest.svelte';
	import ActionLink from '../ActionLink.svelte';
	import EntityActions from '../EntityActions.svelte';
	import ActionConfirmation from '../ActionConfirmation.svelte';
	import { local } from '#lib/stores/local.ts';
	import { relationsOf, type GuidRow } from '#lib/stores/guids.ts';
	import { ladderSettings } from './ladderSettings.ts';
	import {
		joinLadder,
		activateLadder,
		awayLadder,
		returnLadder,
		leaveLadder
	} from '#lib/stores/remote.ts';
	let {
		ladder,
		section = 'all'
	}: { ladder: GuidRow; section?: 'all' | 'primary' | 'options' } = $props();
	const mine = $derived(
		relationsOf(ladder.rk).find(
			(row) => row.rk === $local.caller_id && row.state !== 'left'
		)
	);
	const club = $derived(
		relationsOf(ladder.rk).find((row) => row.rk.startsWith('club_'))?.rk ?? ladder.rejection_club
	);
	const clubAdmin = $derived(
		typeof club === 'string' &&
			relationsOf(club).some(
				(row) => row.rk === $local.caller_id && row.is_admin === true
			)
	);

	const associated = $derived(
		!!mine && (mine.is_participant === true || mine.state === 'pending')
	);
	const summary = $derived(
		['format', 'ladder_system', 'match_format']
			.map((key) => {
				const setting = ladderSettings[key];
				return setting.type === 'enum'
					? (setting.values[
							String(ladder[key] ?? setting.default)
						]?.label.toLowerCase() ?? String(ladder[key]))
					: '';
			})
			.join(' • ')
	);
</script>

{#snippet editOption()}
	{#if mine?.state === 'pending' && ladder.state === 'active'}
		<ActionConfirmation inline name="leave ladder" message={`leave ${ladder.name}? Ongoing matches will be forfeited`}
			action={() => leaveLadder(ladder.rk)} />
	{/if}
	{#if mine?.is_admin === true}<ActionLink href={`/ladder/${ladder.rk}/edit`} />{/if}
{/snippet}

<EntityActions
	{section}
	options={mine?.is_admin === true || mine?.state === 'pending' ? editOption : undefined}
	{summary}
	more={ladder.state === 'active' && associated && mine?.state !== 'pending'}
>
	{#snippet help()}
		<HelpText topic="feature.ladder" />
		{#each Object.entries(ladderSettings) as [key, setting] (key)}
			{@const value = ladder[key] ?? setting.default}
			{#if setting.type === 'enum'}
				<HelpText topic={`settings.${key}.${value}`} label={setting.values[String(value)]?.label} />
			{:else}
				<HelpText topic={`settings.${key}`} label={`${setting.label} • ${value} days`} />
			{/if}
		{/each}
	{/snippet}
	{#if ladder.state === 'rejected'}
		<p class="description">creation request rejected</p>
		{#if clubAdmin && ladder.rejection_club}<RejectCreationRequest id={ladder.rk} resuming />{/if}
	{:else if ladder.state === 'pending' && clubAdmin}
		<RejectCreationRequest id={ladder.rk} />
		<ActionConfirmation
			inline
			arrow
			showLabel
			name="approve this ladder"
			message={`approve ${ladder.name} to make it active?`}
			action={() => activateLadder(ladder.rk)}
		/>
	{:else if associated && mine?.state !== 'pending'}
		{#if mine?.is_participant === true}
			{#if mine.state === 'away'}<ActionConfirmation
					inline
					arrow
					showLabel
					name="return"
					message="set your status as available?"
					action={() => returnLadder(ladder.rk)}
				/>
			{:else}<ActionConfirmation
					inline
					arrow
					showLabel
					name="away"
					message="set your status as away? Ongoing matches will be forfeited"
					action={() => awayLadder(ladder.rk)}
				/>{/if}
		{/if}
		<ActionConfirmation
			inline
			arrow
			showLabel
			name="leave ladder"
			message={`leave ${ladder.name}? Ongoing matches will be forfeited`}
			action={() => leaveLadder(ladder.rk)}
		/>
	{:else if ladder.state === 'active'}
		<ActionConfirmation
			inline
			arrow
			showLabel
			name="request to join" message={`request to join ${ladder.name}?`}
			action={() => joinLadder(ladder.rk)}
			disabled={!$local.caller_id || mine?.state === 'pending'}
		/>
	{/if}
</EntityActions>

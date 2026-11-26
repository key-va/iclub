<script lang="ts">
	import RejectCreationRequest from '#lib/components/RejectCreationRequest.svelte';
	import ActionLink from '../ActionLink.svelte';
	import EntityActions from '../EntityActions.svelte';
	import HiddenOptions from '../hiddenOptions.svelte';
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
		adminOnly = false
	}: { ladder: GuidRow; adminOnly?: boolean } = $props();
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
	const showMembershipOptions = $derived(ladder.state === 'active' && associated && mine?.state !== 'pending');
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

{#snippet cancelRequest()}
	{#if mine?.state === 'pending' && ladder.state === 'active'}
		<ActionConfirmation inline name="leave ladder" message={`leave ${ladder.name}? Ongoing matches will be forfeited`}
			action={() => leaveLadder(ladder.rk)} />
	{/if}
{/snippet}

{#snippet membershipOptions()}
	{#if mine?.is_participant === true}
		{#if mine.state === 'away'}<ActionConfirmation
				inline
				name="return"
				message="set your status as available?"
				action={() => returnLadder(ladder.rk)}
			/>
		{:else}<ActionConfirmation
				inline
				name="away"
				message="set your status as away? Ongoing matches will be forfeited"
				action={() => awayLadder(ladder.rk)}
			/>{/if}
	{/if}
	<ActionConfirmation
		inline
		name="leave ladder"
		message={`leave ${ladder.name}? Ongoing matches will be forfeited`}
		action={() => leaveLadder(ladder.rk)}
	/>
{/snippet}

{#if adminOnly}
	{#if (mine?.is_admin === true) || (clubAdmin && (ladder.state === 'pending' || (ladder.state === 'rejected' && ladder.rejection_club)))}
		<HiddenOptions inline title="Admin Options">
			{#if clubAdmin && ladder.state === 'pending'}
				<RejectCreationRequest id={ladder.rk} />
				<ActionConfirmation
					inline
					arrow
					showLabel
					name="approve this ladder"
					message={`approve ${ladder.name} to make it active?`}
					action={() => activateLadder(ladder.rk)}
				/>
			{:else if clubAdmin && ladder.state === 'rejected' && ladder.rejection_club}
				<RejectCreationRequest id={ladder.rk} resuming />
			{/if}
			{#if mine?.is_admin === true}<ActionLink href={`/ladder/${ladder.rk}/edit`} />{/if}
		</HiddenOptions>
	{/if}
{:else}
	<EntityActions
		moreOptions={showMembershipOptions ? membershipOptions : ladder.state === 'active' && mine?.state === 'pending' ? cancelRequest : undefined}
		{summary}
	>
		{#snippet help()}
			{#each Object.entries(ladderSettings) as [key, setting]}
				{@const value = ladder[key] ?? setting.default}
				<p class="info description">
					<strong>{setting.label}</strong>: {setting.type === 'enum'
						? setting.values[String(value)]?.label
						: `${value} days`}<br />{setting.type === 'enum'
						? setting.values[String(value)]?.description
						: setting.description}
				</p>
			{/each}
		{/snippet}
		{#if ladder.state === 'rejected'}
			<p class="description">creation request rejected</p>
		{:else if ladder.state === 'pending' && mine?.is_admin === true}
			<button type="button" class="grey" disabled>
				<p>pending club approval</p>
			</button>
		{:else if ladder.state === 'active' && !showMembershipOptions}
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
{/if}

<script lang="ts">
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
		relationsOf(ladder.rk).find((row) => row.rk.startsWith('club_'))
	);
	const clubAdmin = $derived(
		!!club &&
			relationsOf(club.rk).some(
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
		<ActionConfirmation inline name="leave ladder" message="Cancel your join request?"
			action={() => leaveLadder(ladder.rk)} />
	{/if}
	{#if mine?.is_admin === true}<ActionLink href={`/ladder/${ladder.rk}/edit`} name="edit" />{/if}
{/snippet}

<EntityActions
	{section}
	options={mine?.is_admin === true || mine?.state === 'pending' ? editOption : undefined}
	{summary}
	more={ladder.state === 'active' && associated && mine?.state !== 'pending'}
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
	{#if ladder.state === 'pending' && clubAdmin}
		<ActionConfirmation
			inline
			arrow
			showLabel
			name="approve this ladder"
			message={`Approve ${ladder.name} to make it active?`}
			action={() => activateLadder(ladder.rk)}
		/>
	{:else if associated && mine?.state !== 'pending'}
		{#if mine?.is_participant === true}
			{#if mine.state === 'away'}<ActionConfirmation
					inline
					arrow
					showLabel
					name="return"
					message="Return from away? Cooling begins when all partners are back."
					action={() => returnLadder(ladder.rk)}
				/>
			{:else}<ActionConfirmation
					inline
					arrow
					showLabel
					name="away"
					message="Go away and forfeit ongoing matches?"
					action={() => awayLadder(ladder.rk)}
				/>{/if}
		{/if}
		<ActionConfirmation
			inline
			arrow
			showLabel
			name="leave ladder"
			message="Leave this ladder and forfeit ongoing matches? In doubles, both partners leave."
			action={() => leaveLadder(ladder.rk)}
		/>
	{:else if ladder.state === 'active'}
		<ActionConfirmation
			inline
			arrow
			showLabel
			name="request to join"
			action={() => joinLadder(ladder.rk)}
			disabled={!$local.caller_id || mine?.state === 'pending'}
		/>
	{/if}
</EntityActions>

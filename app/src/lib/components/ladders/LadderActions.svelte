<script lang="ts">
	import EntityActions from '../EntityActions.svelte';
	import ActionConfirmation from '../ActionConfirmation.svelte';
	import { local } from '#lib/stores/local.ts';
	import { relationsOf, type GuidRow } from '#lib/stores/guids.ts';
	import { ladderSettings } from './ladderSettings.ts';
	import {
		joinLadder,
		awayLadder,
		returnLadder,
		leaveLadder
	} from '#lib/stores/remote.ts';
	let { ladder }: { ladder: GuidRow } = $props();
	const mine = $derived(
		relationsOf(ladder.rk).find(
			(row) => row.rk === $local.caller_id && row.state !== 'left'
		)
	);
	const associated = $derived(
		!!mine &&
			(mine.is_participant === true ||
				mine.state === 'pending')
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

<EntityActions {summary} more={associated}>
	{#snippet help()}
		{#each Object.entries(ladderSettings) as [key, setting]}
			{@const value = ladder[key] ?? setting.default}
			<p class="info">
				<strong>{setting.label}</strong>: {setting.type === 'enum'
					? setting.values[String(value)]?.label
					: `${value} days`}<br />{setting.type === 'enum'
					? setting.values[String(value)]?.description
					: setting.description}
			</p>
		{/each}
	{/snippet}
	{#if associated}
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
			disabled={!$local.caller_id}
		/>
	{/if}
</EntityActions>

<script lang="ts">
	import EntityActions from '../EntityActions.svelte';
	import ActionConfirmation from '../ActionConfirmation.svelte';
	import { local } from '#lib/stores/local.ts';
	import { relationsOf, type GuidRow } from '#lib/stores/guids.ts';
	import { availabilityOptions, roundRoleLabel, isTeamMember } from './roundRules.ts';
	import { confirmRoundRole } from '#lib/stores/remote.ts';
	let { round, team }: { round: GuidRow; team: GuidRow } = $props();
	const mine = $derived(
		relationsOf(round.rk).find((row) => row.rk === $local.caller_id)
	);
	const member = $derived(
		isTeamMember(
			relationsOf(team.rk).find((row) => row.rk === $local.caller_id)
		)
	);
	const roles = ['unavailable', 'available'] as const;
	const options = $derived(availabilityOptions(mine?.role));
	const showActions = $derived(member && !!mine && !['complete', 'eliminated'].includes(String(round.state)));
</script>

<EntityActions>
	{#snippet help()}<p class="info">Set your availability for this round. Team administrators select available players.</p>{/snippet}
	{#if showActions}
		{#each roles as role}<ActionConfirmation
				inline
				arrow={role === 'available'}
				showLabel
				name={roundRoleLabel(role)}
				message={`mark yourself as ${roundRoleLabel(role)}?`}
				disabled={!options.includes(role)}
				action={() => confirmRoundRole(round.rk, role)}
			/>{/each}
	{/if}
</EntityActions>

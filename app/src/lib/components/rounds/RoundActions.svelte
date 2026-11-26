<script lang="ts">
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

{#if showActions}
		{#each roles.filter((role) => options.includes(role)) as role}<ActionConfirmation
				inline
				arrow={role === 'available'}
				showLabel
				name={roundRoleLabel(role)}
				message={`mark yourself as ${roundRoleLabel(role)}?`}
				action={() => confirmRoundRole(round.rk, role)}
			/>{/each}
	{/if}

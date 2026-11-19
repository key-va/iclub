<script lang="ts">
	import EntityActions from '../EntityActions.svelte';
	import ActionConfirmation from '../ActionConfirmation.svelte';
	import { local } from '#lib/stores/local.ts';
	import { relationsOf, type GuidRow } from '#lib/stores/guids.ts';
	import { availabilityOptions, isTeamMember } from './roundRules.ts';
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
	const options = $derived(
		member && round.state !== 'complete' ? availabilityOptions(mine?.role) : []
	);
</script>

{#if options.length}<EntityActions>
		{#each options as role}<ActionConfirmation
				inline
				arrow
				showLabel
				name={role}
				action={() => confirmRoundRole(round.rk, role)}
			/>{/each}
	</EntityActions>{/if}

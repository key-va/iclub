<script lang="ts">
	import EntityActions from '../EntityActions.svelte';
	import ActionConfirmation from '../ActionConfirmation.svelte';
	import { local } from '#lib/stores/local.ts';
	import { relationsOf, type GuidRow } from '#lib/stores/guids.ts';
	import { joinTeam, leaveTeam } from '#lib/stores/remote.ts';
	let { team }: { team: GuidRow } = $props();
	const mine = $derived(
		relationsOf(team.rk).find(
			(row) => row.rk === $local.caller_id && row.state !== 'left'
		)
	);
</script>

{#if team.state === 'active'}
	<EntityActions
		summary={[
			team.section_name ?? team.ext_section_name,
			(team.rank ?? team.ext_rank) != null
				? `rank ${team.rank ?? team.ext_rank}`
				: null
		]
			.filter((value) => value != null && value !== '')
			.join(' • ')}
		more={!!mine}
	>
		{#if mine}<ActionConfirmation
				inline
				arrow
				showLabel
				name="leave team"
				message="Leave this team?"
				action={() => leaveTeam(team.rk)}
			/>
		{:else}<ActionConfirmation
				inline
				arrow
				showLabel
				name="request to join"
				action={() => joinTeam(team.rk)}
				disabled={!$local.caller_id}
			/>{/if}
	</EntityActions>
{/if}

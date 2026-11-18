<script lang="ts">
	import { page } from '$app/state';
	import { guids, entityOf } from '#lib/stores/guids.ts';
	import { teamView } from '#lib/components/rounds/roundRules.ts';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	import TeamSummary from '#lib/components/teams/TeamSummary.svelte';
	const id = $derived(page.params.team_id ?? '');
	const teamEntity = $derived(entityOf(id));
	const team = $derived(teamEntity ? teamView(teamEntity) : undefined);
</script>

<div class="page">
	{#if team}
		<EntityHeader entity={team} />
		<TeamSummary {team} />
	{:else}
		<div class="row right">
			<p>{$guids.loaded ? 'Team not found' : 'Loading…'}</p>
		</div>
	{/if}
</div>

<style>
	.page {
		width: 100%;
	}
</style>

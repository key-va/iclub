<script lang="ts">
	import { guids, relatedEntities, hrefOf, imageOf, type GuidRow } from '#lib/stores/guids.ts';
	import { local } from '#lib/stores/local.ts';
	import { ladderMembership } from './ladderRules.ts';
	import RouteLink from '../routeLink.svelte';
	import ApiService from '../apiService.svelte';

	let { ladder }: { ladder: GuidRow } = $props();
	const pending = $derived(relatedEntities($guids.items, ladder.rk, 'user').filter(user => user.relation.state === 'pending'));
	const isLadderAdmin = $derived(ladderMembership($guids.items, ladder, $local.caller_id).userRelation?.is_admin === true);
	let selectedPairUserId = $state<string | null>(null);
	const selectedPairUser = $derived(pending.find(player => player.rk === selectedPairUserId));
	$effect(() => {
		if (!selectedPairUser) selectedPairUserId = null;
	});
</script>

<div class="group">
	{#if isLadderAdmin && pending.length > 0}
		{#each pending as player (player.rk)}
			<RouteLink href={hrefOf(player.rk)} title={player.name ?? 'no name'} description="waiting to join" image={imageOf(player.rk)}>
				{#if ladder.format === 'doubles'}
					{#if selectedPairUser && selectedPairUser.rk !== player.rk}
						<ApiService inline name={`pair with ${selectedPairUser.name ?? 'this player'}`}
							message={`pair ${player.name ?? 'this player'} with ${selectedPairUser.name ?? 'this player'}?`}
							endpoint={`ladder/${ladder.rk}/accept`} data={{ user_ids: [selectedPairUser.rk, player.rk] }}
							confirm={false} onsuccess={() => { selectedPairUserId = null; }} />
					{:else}
						<button class="blue" aria-label={selectedPairUserId === player.rk ? 'deselect player' : 'select player'}
							onclick={() => selectedPairUserId = selectedPairUserId === player.rk ? null : player.rk}>
							<p>{selectedPairUserId === player.rk ? 'selected' : 'select'}</p>
						</button>
					{/if}
				{:else}
					<ApiService inline name="accept" message={`accept ${player.name ?? 'this player'} onto the ladder?`}
						endpoint={`ladder/${ladder.rk}/accept`} data={{ user_id: player.rk }} confirm={false} />
				{/if}
			</RouteLink>
		{/each}
	{/if}
</div>

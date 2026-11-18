<script lang="ts">
	import { hrefOf, imageOf, type GuidRow, relationsOf, typeOf, nameOf, entityOf } from '#lib/stores/guids.ts';
	import { local } from '#lib/stores/local.ts';
	import { ladderMembership } from './ladderRules.ts';
	import RouteLink from '../routeLink.svelte';
	import ApiService from '../apiService.svelte';

	let { ladder }: { ladder: GuidRow } = $props();
	const pending = $derived(relationsOf(ladder.rk).filter(row => typeOf(row.rk) === 'user' && entityOf(row.rk)).filter(user => user.state === 'pending'));
	const isLadderAdmin = $derived(ladderMembership(ladder, $local.caller_id).userRelation?.is_admin === true);
	let selectedPairUserId = $state<string | null>(null);
	const selectedPairUser = $derived(pending.find(player => player.rk === selectedPairUserId));
	$effect(() => {
		if (!selectedPairUser) selectedPairUserId = null;
	});
</script>

<div class="group">
	{#if isLadderAdmin && pending.length > 0}
		{#each pending as player (player.rk)}
			<RouteLink href={hrefOf(player.rk)} title={nameOf(player.rk)} description="waiting to join" image={imageOf(player.rk)}>
				{#if ladder.format === 'doubles'}
					{#if selectedPairUser && selectedPairUser.rk !== player.rk}
						<ApiService inline name={`pair with ${nameOf(selectedPairUser.rk)}`}
							message={`pair ${nameOf(player.rk)} with ${nameOf(selectedPairUser.rk)}?`}
							endpoint={`ladder/${ladder.rk}/accept`} data={{ user_ids: [selectedPairUser.rk, player.rk] }}
							confirm={false} onsuccess={() => { selectedPairUserId = null; }} />
					{:else}
						<button class="blue" aria-label={selectedPairUserId === player.rk ? 'deselect player' : 'select player'}
							onclick={() => selectedPairUserId = selectedPairUserId === player.rk ? null : player.rk}>
							<p>{selectedPairUserId === player.rk ? 'selected' : 'select'}</p>
						</button>
					{/if}
				{:else}
					<ApiService inline name="accept" message={`accept ${nameOf(player.rk)} onto the ladder?`}
						endpoint={`ladder/${ladder.rk}/accept`} data={{ user_id: player.rk }} confirm={false} />
				{/if}
			</RouteLink>
		{/each}
	{/if}
</div>

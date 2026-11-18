<script lang="ts">
	import { hrefOf, imageOf, type GuidRow, relationsOf, typeOf, nameOf, entityOf } from '#lib/stores/guids.ts';
	import { local } from '#lib/stores/local.ts';
	import { ladderMembership } from './ladderRules.ts';
	import RouteLinkHiddenAction from '#lib/components/RouteLinkHiddenAction.svelte';
	import ActionQuick from '../ActionQuick.svelte';
	import { acceptLadderMember, acceptLadderPair } from '#lib/stores/remote.ts';

	let { ladder }: { ladder: GuidRow } = $props();
	const pending = $derived(relationsOf(ladder.rk).filter(row => typeOf(row.rk) === 'user' && entityOf(row.rk)).filter(user => user.state === 'pending'));
	const isLadderAdmin = $derived(ladderMembership(ladder, $local.caller_id).userRelation?.is_admin === true);
	let selectedPairUserId = $state<string | null>(null);
	const selectedPairUser = $derived(pending.find(player => player.rk === selectedPairUserId));
	const selectedFirstName = $derived(selectedPairUser ? nameOf(selectedPairUser.rk).trim().split(/\s+/)[0] || 'this player' : '');
	$effect(() => {
		if (!selectedPairUser) selectedPairUserId = null;
	});
</script>

<div class="group">
	{#if isLadderAdmin && pending.length > 0}
		{#each pending as player (player.rk)}
			<RouteLinkHiddenAction href={hrefOf(player.rk)} title={nameOf(player.rk)} description="waiting to join" image={imageOf(player.rk)} colour={selectedPairUserId === player.rk ? 'green' : 'orange'}>
				{#if ladder.format === 'doubles'}
					{#if selectedPairUser && selectedPairUser.rk !== player.rk}
						<ActionQuick inline name={`accept with ${selectedFirstName}`}
							action={() => acceptLadderPair(ladder.rk, [selectedPairUser!.rk, player.rk])}
							onsuccess={() => { selectedPairUserId = null; }} />
					{:else}
						<button class="blue" aria-label={selectedPairUserId === player.rk ? 'deselect player' : 'select player'}
							onclick={() => selectedPairUserId = selectedPairUserId === player.rk ? null : player.rk}>
							<p>{selectedPairUserId === player.rk ? 'selected' : 'select'}</p>
						</button>
					{/if}
				{:else}
					<ActionQuick inline name="accept"
						action={() => acceptLadderMember(ladder.rk, player.rk)} />
				{/if}
			</RouteLinkHiddenAction>
		{/each}
	{/if}
</div>

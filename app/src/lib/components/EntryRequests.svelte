<script lang="ts">
	import RejectJoinRequest from '#lib/components/RejectJoinRequest.svelte';
	import { hrefOf, imageOf, nameOf, type GuidRow } from '#lib/stores/guids.ts';
	import type { ApiResponse } from '#lib/stores/remote.ts';
	import RouteLinkHiddenAction from './RouteLinkHiddenAction.svelte';
	import ActionQuick from './ActionQuick.svelte';

	let { entityId, pending, doubles, acceptPlayer, acceptPair, acceptLabel, description = 'waiting to join' }: {
		entityId: string;
		pending: GuidRow[];
		doubles: boolean;
		acceptPlayer: (id: string) => Promise<ApiResponse>;
		acceptPair: (ids: [string, string]) => Promise<ApiResponse>;
		acceptLabel?: (id: string) => string;
		description?: string;
	} = $props();
	let selectedPairUserId = $state<string | null>(null);
	const selectedPairUser = $derived(pending.find(player => player.rk === selectedPairUserId));
	const selectedFirstName = $derived(selectedPairUser ? nameOf(selectedPairUser.rk).trim().split(/\s+/)[0] || 'this player' : '');
	$effect(() => {
		if (!selectedPairUser) selectedPairUserId = null;
	});
</script>

<div class="group">
	{#each pending as player (player.rk)}
		{#snippet actions()}
			{#if doubles}
				<RejectJoinRequest {entityId} userId={player.rk} />
				{#if selectedPairUser && selectedPairUser.rk !== player.rk}
					<ActionQuick inline name={`accept with ${selectedFirstName}`}
						action={() => acceptPair([selectedPairUser!.rk, player.rk])}
						onsuccess={() => { selectedPairUserId = null; }} />
				{:else}
					<button type="button" aria-label="select player" class={selectedPairUser ? 'grey' : 'blue'}
						disabled={!!selectedPairUser}
						onclick={() => { selectedPairUserId = player.rk; }}>
						<p>select</p>
					</button>
				{/if}
			{:else}
				<ActionQuick inline name="accept" label={acceptLabel?.(player.rk)}
					action={() => acceptPlayer(player.rk)} />
				<RejectJoinRequest {entityId} userId={player.rk} />
			{/if}
		{/snippet}
		<RouteLinkHiddenAction href={hrefOf(player.rk)} title={nameOf(player.rk)} {description} image={imageOf(player.rk)} colour={selectedPairUserId === player.rk ? 'green' : 'orange'}
			children={actions} />
	{/each}
</div>

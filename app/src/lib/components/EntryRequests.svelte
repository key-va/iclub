<script lang="ts">
	import { hrefOf, imageOf, nameOf, type GuidRow } from '#lib/stores/guids.ts';
	import type { ApiResponse } from '#lib/stores/remote.ts';
	import RouteLinkHiddenAction from './RouteLinkHiddenAction.svelte';
	import ActionQuick from './ActionQuick.svelte';

	let { pending, doubles, acceptPlayer, acceptPair, acceptLabel }: {
		pending: GuidRow[];
		doubles: boolean;
		acceptPlayer: (id: string) => Promise<ApiResponse>;
		acceptPair: (ids: [string, string]) => Promise<ApiResponse>;
		acceptLabel?: (id: string) => string;
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
		<RouteLinkHiddenAction href={hrefOf(player.rk)} title={nameOf(player.rk)} description="waiting to join" image={imageOf(player.rk)} colour={selectedPairUserId === player.rk ? 'green' : 'orange'}>
			{#if doubles}
				{#if selectedPairUser && selectedPairUser.rk !== player.rk}
					<ActionQuick inline name={`accept with ${selectedFirstName}`}
						action={() => acceptPair([selectedPairUser!.rk, player.rk])}
						onsuccess={() => { selectedPairUserId = null; }} />
				{:else}
					<button class="blue" aria-label={selectedPairUserId === player.rk ? 'deselect player' : 'select player'}
						onclick={() => selectedPairUserId = selectedPairUserId === player.rk ? null : player.rk}>
						<p>{selectedPairUserId === player.rk ? 'selected' : 'select'}</p>
					</button>
				{/if}
			{:else}
				<ActionQuick inline name="accept" label={acceptLabel?.(player.rk)}
					action={() => acceptPlayer(player.rk)} />
			{/if}
		</RouteLinkHiddenAction>
	{/each}
</div>

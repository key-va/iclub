<script lang="ts">
	import { type GuidRow, relationsOf, typeOf, entityOf } from '#lib/stores/guids.ts';
	import { local } from '#lib/stores/local.ts';
	import { ladderMembership } from './ladderRules.ts';
	import EntryRequests from '../EntryRequests.svelte';
	import { acceptLadderMember, acceptLadderPair } from '#lib/stores/remote.ts';

	let { ladder }: { ladder: GuidRow } = $props();
	const pending = $derived(relationsOf(ladder.rk).filter(row => typeOf(row.rk) === 'user' && entityOf(row.rk)).filter(user => user.state === 'pending'));
	const isLadderAdmin = $derived(ladderMembership(ladder, $local.caller_id).userRelation?.is_admin === true);
</script>

{#if isLadderAdmin && pending.length > 0}
	<EntryRequests {pending} doubles={ladder.format === 'doubles'}
		acceptPlayer={(id) => acceptLadderMember(ladder.rk, id)}
		acceptPair={(ids) => acceptLadderPair(ladder.rk, ids)} />
{:else}
	<div class="group"></div>
{/if}

<script lang="ts">
	import RouteLinkHiddenAction from '../../src/lib/components/RouteLinkHiddenAction.svelte';
	import ActionQuick from '../../src/lib/components/ActionQuick.svelte';
	import type { ApiResponse } from '../../src/lib/stores/remote.ts';
	let { withAction = true, colour = 'green', action = async () => ({ success: true, message: 'done' }) }: {
		withAction?: boolean;
		colour?: string;
		action?: () => Promise<ApiResponse>;
	} = $props();
</script>

{#snippet detail()}2{/snippet}
{#if withAction}
	<RouteLinkHiddenAction href="/user/user_sam" title="Sam Smith" description="available" image="/sam.jpg" {colour} {detail}>
		<ActionQuick inline name="challenge" {action} />
	</RouteLinkHiddenAction>
{:else}
	<RouteLinkHiddenAction href="/user/user_sam" title="Sam Smith" description="available" image="/sam.jpg" {colour} {detail} />
{/if}

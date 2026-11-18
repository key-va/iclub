<script lang="ts">
	import RouteLink from '../../src/lib/components/routeLink.svelte';
	import ActionQuick from '../../src/lib/components/ActionQuick.svelte';
	import type { ApiResponse } from '../../src/lib/stores/remote.ts';

	let { withAction = false, timeout = 9000, action = async () => ({ success: true, message: 'done' }) }: {
		withAction?: boolean;
		timeout?: number;
		action?: () => Promise<ApiResponse>;
	} = $props();
</script>

{#snippet detail()}<span aria-label="active">2</span>{/snippet}
{#if withAction}
	<RouteLink href="/user/user_sam" title="Sam Smith" description="available" image="/sam.jpg" {timeout} {detail}>
		<ActionQuick inline name="challenge" {action} />
	</RouteLink>
{:else}
	<RouteLink href="/user/user_sam" title="Sam Smith" description="available" image="/sam.jpg" {timeout} {detail} />
{/if}

<script lang="ts">
	import ActionControl, { type ActionProps } from './ActionControl.svelte';
	import type { NavigationResponse } from '#lib/stores/remote.ts';
	let props: Omit<ActionProps, 'action'> & {
		action: () => Promise<NavigationResponse>;
	} = $props();
</script>

<ActionControl {...props} confirm={true} navigate={true} />

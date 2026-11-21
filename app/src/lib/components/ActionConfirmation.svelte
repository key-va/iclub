<script lang="ts">
	import ActionControl, { type ActionProps } from './ActionControl.svelte';
	import type { NavigationResponse } from '#lib/stores/remote.ts';
	let { navigate = true, ...props }: Omit<ActionProps, 'action'> &
		(
			| { navigate?: true; action: () => Promise<NavigationResponse> }
			| { navigate: false; action: ActionProps['action'] }
		) = $props();
</script>

<ActionControl {...props} confirm={true} {navigate} />

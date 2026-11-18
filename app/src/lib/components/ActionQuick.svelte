<script lang="ts">
	import ActionControl, { type ActionProps } from './ActionControl.svelte';
	let props: Omit<ActionProps, 'message'> = $props();
</script>

<ActionControl {...props} confirm={false} navigate={false} />

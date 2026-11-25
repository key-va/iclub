<script lang="ts">
	import ActionConfirmation from './ActionConfirmation.svelte';
	import { nameOf } from '#lib/stores/guids.ts';
	import { rejectCreationRequest } from '#lib/stores/remote.ts';

	let { id, resuming = false }: { id: string; resuming?: boolean } = $props();
</script>

<ActionConfirmation
	inline
	showLabel
	name={resuming ? 'finish rejection' : 'reject'}
	action={() => rejectCreationRequest(id)}
	message={resuming ? `finish rejecting the request to create ${nameOf(id)}?` : `reject the request to create ${nameOf(id)}?`}
/>

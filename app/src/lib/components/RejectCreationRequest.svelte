<script lang="ts">
	import ActionConfirmation from './ActionConfirmation.svelte';
	import { nameOf } from '#lib/stores/guids.ts';
	import { rejectCreationRequest } from '#lib/stores/remote.ts';

	let { id }: { id: string } = $props();
</script>

<ActionConfirmation
	inline
	showLabel
	navigate={false}
	name="reject"
	message={`reject the request to create ${nameOf(id)}?`}
	action={() => rejectCreationRequest(id)}
/>

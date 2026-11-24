<script lang="ts">
	import ActionConfirmation from './ActionConfirmation.svelte';
	import { nameOf } from '#lib/stores/guids.ts';
	import { rejectJoinRequest } from '#lib/stores/remote.ts';

	let { entityId, userId, inline = true }: {
		entityId: string;
		userId: string;
		inline?: boolean;
	} = $props();
</script>

<ActionConfirmation
	{inline}
	navigate={false}
	name="reject"
	message={`reject ${nameOf(userId)}’s request to join ${nameOf(entityId)}?`}
	action={() => rejectJoinRequest(entityId, userId)}
/>

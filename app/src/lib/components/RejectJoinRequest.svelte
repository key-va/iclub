<script lang="ts">
	import ActionQuick from './ActionQuick.svelte';
	import { rejectJoinRequest } from '#lib/stores/remote.ts';

	let { entityId, userId }: {
		entityId: string;
		userId: string;
	} = $props();
</script>

<ActionQuick
	inline
	name="reject"
	action={() => rejectJoinRequest(entityId, userId)}
/>

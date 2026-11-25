<script lang="ts">
	import ActionQuick from './ActionQuick.svelte';
	import { goto } from '$app/navigation';
	import { navigationHref, rejectCreationRequest } from '#lib/stores/remote.ts';

	let { id, resuming = false }: { id: string; resuming?: boolean } = $props();
</script>

<ActionQuick
	inline
	showLabel
	name={resuming ? 'finish rejection' : 'reject'}
	action={() => rejectCreationRequest(id)}
	onsuccess={(result) => goto(navigationHref(result.subject ?? "/browse"))}
/>

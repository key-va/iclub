<script lang="ts">
	import { page } from '$app/state';
	import EntityNameImageEdit from '#lib/components/EntityNameImageEdit.svelte';
</script>

<EntityNameImageEdit id={page.params.group_id ?? ''} type="group" />

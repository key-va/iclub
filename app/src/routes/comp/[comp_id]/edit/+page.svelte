<script lang="ts">
	import { page } from '$app/state';
	import EntityNameImageEdit from '#lib/components/EntityNameImageEdit.svelte';
</script>

<EntityNameImageEdit id={page.params.comp_id ?? ''} type="comp" />

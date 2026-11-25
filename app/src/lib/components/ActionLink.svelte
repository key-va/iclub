<script lang="ts">
	import ActionConfirmation from './ActionConfirmation.svelte';

	let { href, name = 'edit' }: { href: string; name?: string } = $props();
</script>

<ActionConfirmation inline arrow showLabel {name}
	action={async () => ({ success: true, message: '', subject: href })} />

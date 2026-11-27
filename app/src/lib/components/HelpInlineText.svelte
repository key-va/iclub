<script lang="ts">
	let { text }: { text: string } = $props();

	const parts = $derived(text.split(/(?<![\p{L}\p{N}])'([^'\r\n]+)'(?![\p{L}\p{N}])/u));
</script>

{#each parts as part, index}{#if index % 2}<strong>{part}</strong>{:else}{part}{/if}{/each}

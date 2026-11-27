<script lang="ts">
	import HelpText from './HelpText.svelte';

	let {
		setting,
		label,
		options = []
	}: {
		setting: string;
		label: string;
		options?: { id: string; name: string }[];
	} = $props();

	const topic = $derived(`settings.${setting}`);
</script>

<HelpText {topic} {label} />
{#each options as option (option.id)}
	<HelpText topic={`${topic}.${option.id}`} label={option.name} />
{/each}

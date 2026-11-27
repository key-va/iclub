<script lang="ts">
	import StatusDot from './StatusDot.svelte';
	import { roundRoleColour } from '#lib/components/rounds/roundRules.ts';
	let { role }: { role: unknown } = $props();
</script>

<StatusDot colour={roundRoleColour[String(role)] ?? 'grey'} label={String(role ?? 'no status')} />

<script lang="ts">
	import { roundRoleColour } from '#lib/rounds.ts';
	let { role }: { role: unknown } = $props();
</script>

<span
	class="dot"
	style:background={roundRoleColour[String(role)] ?? 'grey'}
	role="img"
	aria-label={String(role ?? 'no status')}
></span>

<style>
	.dot {
		display: inline-block;
		width: 0.7em;
		height: 0.7em;
		margin: 0 0.35em;
		border: 2px solid white;
		border-radius: 50%;
	}
</style>

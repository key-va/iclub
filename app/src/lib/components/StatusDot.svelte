<script lang="ts">
	let { colour, label }: { colour: string; label: string } = $props();
</script>

<span class="dot" style:background={colour} role="img" aria-label={label}></span>

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

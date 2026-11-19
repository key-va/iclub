<script lang="ts">
	let { href, name = 'edit' }: { href: string; name?: string } = $props();
</script>

<a class="action-link blue" {href} aria-label={name}>
	<p>{name}</p>
	<svg
		class="action-arrow"
		viewBox="0 0 24 24"
		width="1rem"
		height="1rem"
		fill="none"
		stroke="currentColor"
		stroke-width="3"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="M5 12h14M13 5l7 7-7 7" />
	</svg>
</a>

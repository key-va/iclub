<script lang="ts">
	interface Side {
		href: string;
		title: string;
		description: string;
		image: string;
	}

	interface Props {
		left: Side;
		right: Side;
	}

	let { left, right }: Props = $props();
</script>

<div class="row versus">
	<a class="side" href={left.href}>
		<div class="round-icon-small blue" style="background-image: url('{left.image}');"></div>
		<p class="truncate"><strong>{left.title}</strong><br />{left.description}</p>
	</a>
	<a class="side end" href={right.href}>
		<p class="truncate"><strong>{right.title}</strong><br />{right.description}</p>
		<div class="round-icon-small blue" style="background-image: url('{right.image}');"></div>
	</a>
</div>

<style>
	.versus {
		justify-content: space-between;
	}

	.side {
		display: flex;
		align-items: center;
		flex: 1 1 0;
		min-width: 0;
		color: inherit;
		text-decoration: none;
	}

	.end {
		justify-content: flex-end;
		text-align: right;
	}

	.side:not(.end) {
		text-align: left;
	}
</style>

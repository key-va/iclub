<script lang="ts">
	import { fly } from 'svelte/transition';
	import { PUBLIC_URL } from '#lib/config.ts';
	import { guids, entitiesOfType } from '#lib/stores/guids.ts';

	let filter = $state('');

	const users = $derived(
		entitiesOfType($guids.items, 'user')
			.filter((u) => (u.name ?? '').toLowerCase().includes(filter.toLowerCase()))
			.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
	);
</script>

<div class="page">
	<div class="row right">
		<p class="truncate"><strong>Intra Club</strong><br />menu</p>
		<div class="blank-icon-small"></div>
	</div>

	<div class="row right">
		<input type="text" placeholder="filter" bind:value={filter} />
		<button aria-label="Clear" onclick={() => (filter = '')}>
			<svg viewBox="0 0 24 24" width="1rem" height="1rem" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Search">
				<circle cx="11" cy="11" r="7" />
				<line x1="20" y1="20" x2="16.5" y2="16.5" />
			</svg>
		</button>
	</div>

	{#if users.length > 0}
		<div class="row right"><strong><p>users</p></strong></div>
		<div class="white">
			{#each users as user, index (user.rk)}
				<div class="route-link" in:fly|global={{ y: -50, duration: 150, delay: index * 25, opacity: 0 }}>
					<div class="row right">
						<p class="truncate"><strong>{user.name}</strong><br />user</p>
						<div class="round-icon-small" style="background-image: url('{PUBLIC_URL}/{user.rk}.jpg');"></div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.page {
		width: 100%;
	}
</style>

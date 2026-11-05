<script lang="ts">
	import { page } from '$app/state';
	import { guids, entityOf, imageOf } from '#lib/stores/guids.ts';

	const bot = $derived(entityOf($guids.items, page.params.bot_id ?? ''));
</script>

<div class="page">
	<div class="row right">
		<p class="truncate"><strong>{bot?.name ?? 'Bot'}</strong><br />bot</p>
		<div class="blank-icon-small"></div>
	</div>

	{#if bot}
		<div class="row center">
			<div class="round-icon-big" style="background-image: url('{imageOf(bot.rk)}');"></div>
		</div>

		<div class="group">
			<div class="row center">
				<p>{bot.name} is a system automation account. It takes actions necessary to enforce rules such as timeout violations and forfeits.</p>
			</div>
		</div>
	{/if}
</div>

<style>
	.page {
		width: 100%;
	}
</style>

<script lang="ts">
	import { page } from '$app/state';
	import { local } from '#lib/stores/local.ts';
	import {
		guids,
		entityOf,
		relatedEntities,
		hrefOf,
		imageOf,
	} from '#lib/stores/guids.ts';
	import { officialResult } from '#lib/rounds.ts';
	import ApiService from '#lib/components/apiService.svelte';
	import RouteLink from '#lib/components/routeLink.svelte';
	import HiddenOptions from '#lib/components/hiddenOptions.svelte';
	import RoundRoleDot from '#lib/components/roundRoleDot.svelte';
	import InstallApp from '#lib/components/installApp.svelte';
	const id = $derived(page.params.round_id ?? '');
	const round = $derived(entityOf($guids.items, id));
	const team = $derived(
		round ? entityOf($guids.items, String(round.team_id)) : undefined,
	);
	const players = $derived(relatedEntities($guids.items, id, 'user'));
	const mine = $derived(players.find((p) => p.rk === $local.caller_id));
	const admin = $derived(
		!!team &&
			relatedEntities($guids.items, team.rk, 'user').some(
				(u) => u.rk === $local.caller_id && u.relation.role === 'is_admin',
			),
	);
	const messages = $derived(
		relatedEntities($guids.items, id, 'message')
			.sort((a, b) => a.rk.localeCompare(b.rk))
			.map((message) => ({
				...message,
				sender: relatedEntities($guids.items, message.rk).find(
					(e) => e.relation.role === 'sender',
				),
			})),
	);
	let messageText = $state('');
</script>

<div class="page">
	{#if round && team}
		<div class="row right">
			<p><strong>{round.name}</strong><br />{team.name}</p>
			<div class="blank-icon-small"></div>
		</div>
		<div class="row center">
			<div
				class="round-icon-big"
				style:background-image={`url('${imageOf(team.rk)}')`}
			></div>
		</div>
		<InstallApp />
		<RouteLink
			href={hrefOf(team.rk)}
			title={team.name}
			description="team"
			image={imageOf(team.rk)}
		/>
		<div class="group">
			<HiddenOptions
				title={String(round.date)}
				description={`${round.opponent} · ${round.home_away || 'bye'}`}
			/>
			<HiddenOptions
				title={String(round.venue || 'No venue')}
				description={officialResult(round)}
			/>
		</div>
		{#if mine}<div class="group">
				<HiddenOptions
					title="Your availability"
					description={String(mine.relation.role)}
				/>
				{#each ['pending', 'available', 'unavailable'] as role}<ApiService
						name={role}
						message={`Mark yourself ${role}?`}
						endpoint="round/role"
						data={{ round_id: id, role }}
						disabled={mine.relation.role === role}
						confirm={false}
					/>{/each}
			</div>{/if}
		<div class="group">
			<HiddenOptions title="Players" badge={players.length} />
			{#each players as player}
				<RouteLink
					href={hrefOf(player.rk)}
					title={player.name}
					description={String(player.relation.role)}
					image={imageOf(player.rk)}
					>{#snippet detail()}<RoundRoleDot
							role={player.relation.role}
						/>{/snippet}</RouteLink
				>
				{#if admin && player.rk !== $local.caller_id && (player.relation.role === 'available' || player.relation.role === 'selected')}
					<ApiService
						name={player.relation.role === 'selected' ? 'deselect' : 'select'}
						message={`${player.relation.role === 'selected' ? 'Deselect' : 'Select'} ${player.name}?`}
						endpoint="round/role"
						data={{
							round_id: id,
							user_id: player.rk,
							role:
								player.relation.role === 'selected' ? 'available' : 'selected',
						}}
					/>
				{/if}
			{/each}
		</div>
		<div class="group">
			<HiddenOptions title="Messages" badge={messages.length} />
			{#each messages as message}<RouteLink
					href={hrefOf(message.sender?.rk ?? '')}
					title={message.sender?.name ?? 'Someone'}
					image={imageOf(message.sender?.rk ?? '')}
				/>
				<div class="row right message"><p>{message.name}</p></div>{/each}
			{#if $local.caller_id}<ApiService
					name="send"
					arrow
					endpoint="message/create"
					data={{ round_id: id, text: messageText.trim() }}
					confirm={false}
					disabled={!messageText.trim()}
					onsuccess={() => {
						messageText = '';
					}}
					><input
						aria-label="message"
						placeholder="message"
						maxlength="500"
						bind:value={messageText}
					/></ApiService
				>{:else}<RouteLink
					href="/login"
					title="Log in to send a message"
				/>{/if}
		</div>
	{:else}<div class="row right">
			<p>{$guids.loaded ? 'Round not found' : 'Loading…'}</p>
		</div>{/if}
</div>

<style>
	.page {
		width: 100%;
	}
	.message p {
		padding: 0 2em 1em;
		overflow-wrap: anywhere;
	}
</style>

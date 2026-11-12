<script lang="ts">
	import { page } from '$app/state';
	import { roundView } from '#lib/rounds.ts';
	import { local } from '#lib/stores/local.ts';
	import {
		guids,
		entityOf,
		relatedEntities,
		hrefOf,
		imageOf,
	} from '#lib/stores/guids.ts';
	import ApiService from '#lib/components/apiService.svelte';
	import RouteLink from '#lib/components/routeLink.svelte';
	import HiddenOptions from '#lib/components/hiddenOptions.svelte';
	import RoundRoleDot from '#lib/components/roundRoleDot.svelte';
	import InstallApp from '#lib/components/installApp.svelte';
	const id = $derived(page.params.round_id ?? '');
	const roundEntity = $derived(entityOf($guids.items, id));
	const team = $derived(relatedEntities($guids.items, id, 'team')[0]);
	const round = $derived(
		roundEntity ? roundView(roundEntity, team?.relation) : undefined,
	);
	const complete = $derived(round?.state === 'complete');
	const fixtureName = $derived(`${round?.opponent} vs ${team?.name}`);
	const result = $derived.by(() => {
		if (!round || !team) return { name: '', outcome: '', scores: '' };
		if (round.result === 'bye' || round.result === 'washout')
			return { name: team.name, outcome: round.result, scores: '' };
		const opponentWon = round.result === 'loser';
		return {
			name: opponentWon ? String(round.opponent) : team.name,
			outcome:
				round.result === 'draw'
					? 'draws'
					: ['winner', 'loser'].includes(String(round.result))
						? 'wins'
						: 'result',
			scores: ['points', 'sets', 'games']
				.filter(
					(key) =>
						typeof round[`${key}_for`] === 'number' &&
						typeof round[`${key}_against`] === 'number',
				)
				.map(
					(key) =>
						`${round[`${key}_${opponentWon ? 'against' : 'for'}`]}-${round[`${key}_${opponentWon ? 'for' : 'against'}`]} ${key}`,
				)
				.join(' · '),
		};
	});
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
			<p class="truncate"><strong>{round.name}</strong><br />{round.pk}</p>
			<div class="blank-icon-small"></div>
		</div>
		<div class="row center">
			<div
				class="round-icon-big"
				style:background-image={`url('${imageOf(team.rk)}')`}
			></div>
		</div>
		<InstallApp />
		<div class="group">
			<p class="info center"><strong>{fixtureName}</strong></p>
			{#if complete}
				<p class="info center">
					{result.name}<br />
					{result.outcome}
					{result.scores}
				</p>
			{:else}
				<p class="info center">
					{round.date}{round.venue ? ` at ${round.venue}` : ''}
				</p>
			{/if}
		</div>
		{#if !complete && mine}
			<HiddenOptions
				inline
				title="More Options"
				description={`you are ${mine.relation.role}`}
			>
				{#each ['unavailable', 'available'] as role}
					<ApiService
						inline
						name={role}
						message={`Mark yourself ${role}?`}
						endpoint="round/role"
						data={{ round_id: id, role }}
						disabled={mine.relation.role === role}
						confirm={false}
					/>
				{/each}
			</HiddenOptions>
		{/if}
		<div class="group">
			<RouteLink
				href={hrefOf(team.rk)}
				title={team.name}
				image={imageOf(team.rk)}
			/>
			{#each players as player (player.rk)}
				{#snippet selectionAction()}
					<ApiService
						inline
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
				{/snippet}
				<RouteLink
					href={hrefOf(player.rk)}
					title={player.name}
					description={String(player.relation.role)}
					image={imageOf(player.rk)}
					children={!complete &&
					admin &&
					player.rk !== $local.caller_id &&
					(player.relation.role === 'available' ||
						player.relation.role === 'selected')
						? selectionAction
						: undefined}
				>
					{#snippet detail()}<RoundRoleDot
							role={player.relation.role}
						/>{/snippet}
				</RouteLink>
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

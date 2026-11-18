<script lang="ts">
	import { page } from '$app/state';
	import { roundView, isTeamAdmin, availabilityOptions } from '#lib/rounds.ts';
	import { local } from '#lib/stores/local.ts';
	import { guids, entityOf, hrefOf, imageOf, relationsOf, typeOf, nameOf } from '#lib/stores/guids.ts';
	import ApiService from '#lib/components/apiService.svelte';
	import RouteLink from '#lib/components/routeLink.svelte';
	import HiddenOptions from '#lib/components/hiddenOptions.svelte';
	import RoundRoleDot from '#lib/components/roundRoleDot.svelte';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	const id = $derived(page.params.round_id ?? '');
	const roundEntity = $derived(entityOf(id));
	const team = $derived(relationsOf(id).filter(row => typeOf(row.rk) === 'team' && entityOf(row.rk))[0]);
	const round = $derived(
		roundEntity ? roundView(roundEntity, team) : undefined,
	);
	const complete = $derived(round?.state === 'complete');
	const fixtureName = $derived(`${round?.opponent} vs ${nameOf(team?.rk ?? '')}`);
	const result = $derived.by(() => {
		if (!round || !team) return { name: '', outcome: '', scores: '' };
		if (round.result === 'bye' || round.result === 'washout')
			return { name: nameOf(team.rk), outcome: round.result, scores: '' };
		const opponentWon = round.result === 'loser';
		return {
			name: opponentWon ? String(round.opponent) : nameOf(team.rk),
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
	const players = $derived(relationsOf(id).filter(row => typeOf(row.rk) === 'user' && entityOf(row.rk)));
	const mine = $derived(players.find((p) => p.rk === $local.caller_id));
	const myAvailabilityOptions = $derived(availabilityOptions(mine?.role));
	const admin = $derived(
		!!team &&
			relationsOf(team.rk).filter(row => typeOf(row.rk) === 'user' && entityOf(row.rk)).some(
				(u) => u.rk === $local.caller_id && isTeamAdmin(u),
			),
	);
	const messages = $derived(
		relationsOf(id).filter(row => typeOf(row.rk) === 'message' && entityOf(row.rk))
			.sort((a, b) => a.rk.localeCompare(b.rk))
			.map((message) => ({
				...message,
				sender: relationsOf(message.rk).find(
					(e) => e.role === 'sender',
				),
			})),
	);
	let messageText = $state('');
</script>

<div class="page">
	{#if round && team}
		<EntityHeader entity={round} image={imageOf(team.rk)} />
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
			{#if !complete && myAvailabilityOptions.includes('available')}
				<ApiService
					name="available"
					message="Mark yourself available?"
					endpoint="round/role"
					data={{ round_id: id, role: 'available' }}
				>
					{#if myAvailabilityOptions.includes('unavailable')}
						<ApiService
							inline
							name="unavailable"
							message="Mark yourself unavailable?"
							endpoint="round/role"
							data={{ round_id: id, role: 'unavailable' }}
						/>
					{/if}
				</ApiService>
			{:else if !complete && myAvailabilityOptions.includes('unavailable')}
				<ApiService
					name="unavailable"
					message="Mark yourself unavailable?"
					endpoint="round/role"
					data={{ round_id: id, role: 'unavailable' }}
				/>
			{/if}
		</div>
		
		<div class="group">
			<RouteLink
				href={hrefOf(team.rk)}
				title={nameOf(team.rk)}
				image={imageOf(team.rk)}
			/>
			{#each players as player (player.rk)}
				{#snippet selectionAction()}
					<ApiService
						inline
						name={player.role === 'selected' ? 'available' : 'select'}
						message={player.role === 'selected' ? `Mark ${nameOf(player.rk)} available?` : `Select ${nameOf(player.rk)}?`}
						endpoint="round/role"
						data={{
							round_id: id,
							user_id: player.rk,
							role:
								player.role === 'selected' ? 'available' : 'selected',
						}}
						confirm={false}
					/>
				{/snippet}
				<RouteLink
					href={hrefOf(player.rk)}
					title={nameOf(player.rk)}
					description={String(player.role)}
					image={imageOf(player.rk)}
					children={!complete &&
					admin &&
					(player.role === 'available' ||
						player.role === 'selected')
						? selectionAction
						: undefined}
				>
					{#snippet detail()}<RoundRoleDot
							role={player.role}
						/>{/snippet}
				</RouteLink>
			{/each}
		</div>

		<div class="group">
			<HiddenOptions title="Messages" badge={messages.length} />
			{#each messages as message}<RouteLink
					href={hrefOf(message.sender?.rk ?? '')}
					title={message.sender ? nameOf(message.sender.rk) : 'Someone'}
					image={imageOf(message.sender?.rk ?? '')}
				/>
				<div class="row right message"><p>{nameOf(message.rk)}</p></div>{/each}
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

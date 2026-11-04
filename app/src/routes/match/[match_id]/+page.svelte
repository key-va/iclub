<script lang="ts">
	import { page } from '$app/state';
	import { local } from '#lib/stores/local.ts';
	import { guids, entityOf, relatedEntities, relationsOf, hrefOf, imageOf } from '#lib/stores/guids.ts';

	import ApiService from '#lib/components/apiService.svelte';
	import VersusLink from '#lib/components/versusLink.svelte';
	import HiddenOptions from '#lib/components/hiddenOptions.svelte';

	const { caller_id } = $local;

	const matchId = $derived(page.params.match_id ?? '');
	const match = $derived(entityOf($guids.items, matchId));
	const ladder = $derived(relatedEntities($guids.items, matchId, 'ladder')[0]);
	const players = $derived(relatedEntities($guids.items, matchId, 'user'));
	const challenger = $derived(players.find((player) => player.relation.role === 'challenger'));
	const defender = $derived(players.find((player) => player.relation.role === 'defender'));

	const isLadderAdmin = $derived(
		!!ladder && relationsOf($guids.items, ladder.rk).some((relation) => relation.rk === caller_id && relation.is_admin === true)
	);
	const isPlayer = $derived(caller_id === challenger?.rk || caller_id === defender?.rk);

	let challengerScore = $state('');
	let defenderScore = $state('');
	let showHelp = $state(false);

	// super_set is a single set; the other formats take one number per set, e.g. "6 4"
	const singleSet = $derived((ladder?.match_format ?? 'super_set') === 'super_set');
	const parseSets = (text: string) => text.split(/[\s,]+/).filter(Boolean).map(Number);
	const validSets = (sets: number[]) => sets.every((games) => Number.isInteger(games) && games >= 0 && games <= 99);
	const challengerSets = $derived(parseSets(challengerScore));
	const defenderSets = $derived(parseSets(defenderScore));
	const scoreValid = $derived(
		challengerSets.length > 0 &&
			challengerSets.length === defenderSets.length &&
			(!singleSet || challengerSets.length === 1) &&
			validSets(challengerSets) &&
			validSets(defenderSets)
	);
	const canAccept = $derived(match?.state === 'pending' && (caller_id === defender?.rk || isLadderAdmin));

	// Message ids start with a timestamp, so sorting them gives oldest first
	const messages = $derived(
		relatedEntities($guids.items, matchId, 'message')
			.sort((a, b) => a.rk.localeCompare(b.rk))
			.map((message) => ({ ...message, sender: relatedEntities($guids.items, message.rk, 'user')[0] }))
	);
	let messageText = $state('');
	const messageValid = $derived(messageText.trim() !== '' && !/[\p{C}]/u.test(messageText));
</script>

<div class="page">
	{#if match}
		<div class="row right">
			<p class="truncate"><strong>{match.name}</strong><br />{match.state}</p>
			<div class="blank-icon-small"></div>
		</div>

		{#if ladder}
			<div class="row center">
				<a href={hrefOf(ladder.rk)} aria-label={ladder.name ?? 'ladder'}>
					<div class="round-icon-big" style="background-image: url('{imageOf(ladder.rk)}');"></div>
				</a>
			</div>
		{/if}

		{#if challenger && defender}
			<div class="group">
				<VersusLink
					left={{ href: hrefOf(challenger.rk), title: challenger.name ?? 'no name', description: 'challenger', image: imageOf(challenger.rk) }}
					right={{ href: hrefOf(defender.rk), title: defender.name ?? 'no name', description: 'defender', image: imageOf(defender.rk) }}
				/>
				{#if match.state === 'active'}
					<div class="row scores">
						<input type="text" inputmode="numeric" placeholder={singleSet ? 'score' : 'sets e.g. 6 4'} aria-label="{challenger.name} score" bind:value={challengerScore} />
						<input type="text" inputmode="numeric" placeholder={singleSet ? 'score' : 'sets e.g. 6 4'} aria-label="{defender.name} score" bind:value={defenderScore} />
					</div>
					{#if showHelp}
						<div class="row left help">
							<p>{singleSet ? 'Enter the final games won by each player' : 'Enter the games won in each set, separated by spaces (e.g. 6 4), for each player'}. The result is confirmed once submitted</p>
						</div>
					{/if}
				{/if}
			</div>
		{/if}

		{#if match.state === 'active'}
			<ApiService
				name="submit"
				message={`submit the score ${challengerScore} - ${defenderScore}?`}
				endpoint={`match/${matchId}/complete`}
				data={{ challenger_score: challengerSets, defender_score: defenderSets }}
				disabled={!scoreValid || !(isPlayer || isLadderAdmin)}
			>
				<button class="blue" aria-label="help" aria-pressed={showHelp} onclick={() => (showHelp = !showHelp)}>
					<svg viewBox="0 0 24 24" width="1rem" height="1rem" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Help">
						<path d="M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4" />
						<path d="M12 18h.01" />
					</svg>
				</button>
			</ApiService>
		{/if}
		
		<div class="group">
			{#if messages.length}
				<HiddenOptions title="Messages" description="" badge={messages.length}>
					{#each messages as message (message.rk)}
						<div class="row {message.sender?.rk === caller_id ? 'right' : 'left'} message">
							{#if message.sender && message.sender.rk !== caller_id}
								<div class="round-icon-small blue" style="background-image: url('{imageOf(message.sender.rk)}');"></div>
							{/if}
							<p><strong>{message.sender?.name ?? 'someone'}</strong><br />{message.name}</p>
							{#if message.sender?.rk === caller_id}
								<div class="round-icon-small blue" style="background-image: url('{imageOf(message.sender.rk)}');"></div>
							{/if}
						</div>
					{/each}
				</HiddenOptions>
			{:else}
				<HiddenOptions title="Messages" description="" badge={0} />
			{/if}

			{#if match.state === 'pending' || match.state === 'active'}
				<ApiService
					name="send"
					arrow
					endpoint="message/create"
					data={{ match_id: matchId, text: messageText.trim() }}
					confirm={false}
					disabled={!messageValid || !isPlayer}
					onsuccess={() => {
						messageText = '';
					}}
				>
					<input type="text" placeholder="message" maxlength="500" autocomplete="off" aria-label="message" bind:value={messageText} />
				</ApiService>
			{/if}
		</div>

		<HiddenOptions inline title={String(match.state)} description="more options">
			<ApiService
				inline
				name="forfeit"
				message="forfeit this match? your opponent will be awarded the win"
				endpoint={`match/${matchId}/forfeit`}
				data={{
					...(challengerSets.length && validSets(challengerSets) ? { challenger_score: challengerSets } : {}),
					...(defenderSets.length && validSets(defenderSets) ? { defender_score: defenderSets } : {})
				}}
				disabled={!isPlayer || (match.state !== 'pending' && match.state !== 'active')}
			/>
			{#if match.state === 'pending'}
				<ApiService
					inline
					name="accept"
					message={`accept the challenge from ${challenger?.name ?? 'your opponent'}?`}
					endpoint={`match/${matchId}/accept`}
					disabled={!canAccept}
				/>
			{/if}
		</HiddenOptions>
	
	{:else}
		<div class="row right">
			<p class="truncate"><strong>{$guids.loaded ? 'Not found' : 'Loading'}</strong><br />match</p>
			<div class="blank-icon-small"></div>
		</div>
	{/if}
</div>

<style>
	.page {
		width: 100%;
	}
	.scores {
		gap: 0.5rem;
		padding: 0 0.5rem 0.5rem;
	}
	.scores input {
		flex: 1 1 0;
		min-width: 0;
		text-align: center;
	}
	.message p {
		padding: 0.25em 0.5em;
		overflow-wrap: anywhere;
	}
	.help p {
		padding: 1em 2em;
	}
</style>

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
	import ApiService from '#lib/components/apiService.svelte';
	import RouteLink from '#lib/components/routeLink.svelte';
	import HiddenOptions from '#lib/components/hiddenOptions.svelte';
	import InstallApp from '#lib/components/installApp.svelte';
	const id = $derived(page.params.group_id ?? '');
	const group = $derived(entityOf($guids.items, id));
	const users = $derived(relatedEntities($guids.items, id, 'user'));
	const mine = $derived(
		users.find((user) => user.rk === $local.caller_id)?.relation,
	);
	const admin = $derived(mine?.is_admin === true);
	const club = $derived(relatedEntities($guids.items, id, 'club')[0]);
	const clubAdmin = $derived(
		!!club &&
			relatedEntities($guids.items, club.rk, 'user').some(
				(user) =>
					user.rk === $local.caller_id && user.relation.is_admin === true,
			),
	);
	const participants = $derived(
		users.filter((user) => user.relation.is_participant === true),
	);
	const pending = $derived(
		users.filter((user) => user.relation.state === 'pending'),
	);
	const messages = $derived(
		relatedEntities($guids.items, id, 'message')
			.sort((a, b) => a.rk.localeCompare(b.rk))
			.map((message) => ({
				...message,
				sender: relatedEntities($guids.items, message.rk).find(
					(entity) => entity.relation.role === 'sender',
				),
			})),
	);
	let messageText = $state('');
</script>

<div class="page">
	{#if group}
		<div class="row right">
			<p class="truncate"><strong>{group.name}</strong><br />{group.pk}</p>
			<div class="blank-icon-small"></div>
		</div>
		<div class="row center">
			<div
				class="round-icon-big"
				style:background-image={`url('${imageOf(id)}')`}
			></div>
		</div>
		<InstallApp />
		<div class="group">
			{#if group.state === 'pending'}
				{#if clubAdmin}
					<HiddenOptions
						inline
						title="Pending"
						description="pending club approval"
					>
						<ApiService
							inline
							name="approve group"
							message={`Approve ${group.name}?`}
							endpoint={`group/${id}/activate`}
						/>
					</HiddenOptions>
				{:else}<HiddenOptions
						title="Pending"
						description="pending club approval"
					/>{/if}
			{:else if group.state === 'active'}
				{#if admin}
					{#each pending as user (user.rk)}
						<RouteLink
							href={hrefOf(user.rk)}
							title={user.name}
							description="waiting to join"
							image={imageOf(user.rk)}
						>
							<ApiService
								inline
								name="accept"
								message={`Accept ${user.name} into the group?`}
								endpoint={`group/${id}/accept`}
								data={{ user_id: user.rk }}
								confirm={false}
							/>
						</RouteLink>
					{/each}
				{/if}
				{#if mine?.state === 'pending'}
					<HiddenOptions title="Pending" description="waiting to join" />
				{:else if !mine}
					{#if $local.caller_id}
						<ApiService
							name="join request"
							message={`Request to join ${group.name}?`}
							endpoint={`group/${id}/join`}
						/>
					{:else}<RouteLink href="/login" title="Log in to join" />{/if}
				{/if}
			{/if}
			<HiddenOptions title="Participants" badge={participants.length}>
				{#each participants as user (user.rk)}
					<RouteLink
						href={hrefOf(user.rk)}
						title={user.name}
						description={user.relation.is_admin === true
							? 'admin'
							: 'participant'}
						image={imageOf(user.rk)}
					/>
				{/each}
			</HiddenOptions>
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
					data={{ group_id: id, text: messageText.trim() }}
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
		{#if admin}<RouteLink
				href={`/group/${id}/edit`}
				title="Edit Group"
				description="name and image"
			/>{/if}
	{:else}
		<div class="row right">
			<p class="truncate">
				<strong>{$guids.loaded ? 'Not found' : 'Loading'}</strong><br />group
			</p>
			<div class="blank-icon-small"></div>
		</div>
	{/if}
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

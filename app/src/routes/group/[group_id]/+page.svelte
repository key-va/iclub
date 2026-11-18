<script lang="ts">
	import { page } from '$app/state';
	import { local } from '#lib/stores/local.ts';
	import { guids, entityOf, hrefOf, imageOf, relationsOf, typeOf, nameOf } from '#lib/stores/guids.ts';
	import ActionQuick from '#lib/components/ActionQuick.svelte';
	import { acceptGroupMember } from '#lib/stores/remote.ts';
	import ApiService from '#lib/components/apiService.svelte';
	import RouteLink from '#lib/components/routeLink.svelte';
	import RouteLinkHiddenAction from '#lib/components/RouteLinkHiddenAction.svelte';
	import HiddenOptions from '#lib/components/hiddenOptions.svelte';
	import EntityHeader from '#lib/components/EntityHeader.svelte';
	const id = $derived(page.params.group_id ?? '');
	const group = $derived(entityOf(id));
	const users = $derived(relationsOf(id).filter(row => typeOf(row.rk) === 'user' && entityOf(row.rk)));
	const mine = $derived(
		users.find((user) => user.rk === $local.caller_id),
	);
	const admin = $derived(mine?.is_admin === true);
	const club = $derived(relationsOf(id).filter(row => typeOf(row.rk) === 'club' && entityOf(row.rk))[0]);
	const clubAdmin = $derived(
		!!club &&
			relationsOf(club.rk).filter(row => typeOf(row.rk) === 'user' && entityOf(row.rk)).some(
				(user) =>
					user.rk === $local.caller_id && user.is_admin === true,
			),
	);
	const participants = $derived(
		users.filter((user) => user.is_participant === true),
	);
	const pending = $derived(
		users.filter((user) => user.state === 'pending'),
	);
	const messages = $derived(
		relationsOf(id).filter(row => typeOf(row.rk) === 'message' && entityOf(row.rk))
			.sort((a, b) => a.rk.localeCompare(b.rk))
			.map((message) => ({
				...message,
				sender: relationsOf(message.rk).find(
					(entity) => entity.role === 'sender',
				),
			})),
	);
	let messageText = $state('');
</script>

<div class="page">
	{#if group}
		<EntityHeader entity={group} />
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
						<RouteLinkHiddenAction
							href={hrefOf(user.rk)}
							title={nameOf(user.rk)}
							description="waiting to join"
							image={imageOf(user.rk)}
						 colour="orange">
							<ActionQuick inline name="accept" action={() => acceptGroupMember(id, user.rk)} />
						</RouteLinkHiddenAction>
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
			<HiddenOptions title="Participants">
				{#each participants as user (user.rk)}
					<RouteLink
						href={hrefOf(user.rk)}
						title={nameOf(user.rk)}
						description={user.is_admin === true
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
					title={message.sender ? nameOf(message.sender.rk) : 'Someone'}
					image={imageOf(message.sender?.rk ?? '')}
				/>
				<div class="row right message"><p>{nameOf(message.rk)}</p></div>{/each}
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

<script lang="ts">
	import { local } from '#lib/stores/local.ts';
	import {
		relationsOf,
		typeOf,
		entityOf,
		nameOf,
		hrefOf,
		imageOf
	} from '#lib/stores/guids.ts';
	import { createMessage } from '#lib/stores/remote.ts';
	import RouteLink from '../routeLink.svelte';
	import HiddenOptions from '../hiddenOptions.svelte';
	import ActionConfirmation from '../ActionConfirmation.svelte';
	let { parentId, showTime = false }: { parentId: string; showTime?: boolean } =
		$props();
	const relatedRows = $derived(relationsOf(parentId));
	const messages = $derived(
		relatedRows
			.filter((row) => typeOf(row.rk) === 'message' && entityOf(row.rk))
			.sort((a, b) => a.rk.localeCompare(b.rk))
	);
	let text = $state('');
	const valid = $derived(text.trim() !== '' && !/[\p{C}]/u.test(text));
	const senderOf = (id: string) =>
		relationsOf(id).find((row) => row.role === 'sender');
	function sentAt(id: string) {
		const parts = id.match(/_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})_/);
		if (!parts) return '';
		const [year, month, day, hour, minute, second] = parts.slice(1).map(Number);
		return new Date(
			Date.UTC(year, month - 1, day, hour, minute, second)
		).toLocaleString(undefined, {
			hour: '2-digit',
			minute: '2-digit',
			day: 'numeric',
			month: 'numeric',
			year: '2-digit'
		});
	}
</script>

<div class="group">
	<HiddenOptions title="Messages" badge={messages.length} />
	{#each messages as message (message.rk)}
		{@const sender = senderOf(message.rk)}
		<RouteLink
			href={hrefOf(sender?.rk ?? '')}
			title={sender ? nameOf(sender.rk) : 'Someone'}
			image={imageOf(sender?.rk ?? '')}
			description={showTime ? sentAt(message.rk) : ''}
		/>
		<div class="row right message"><p>{nameOf(message.rk)}</p></div>
	{/each}
	{#if $local.caller_id}
		<ActionConfirmation
			name="send"
			navigate={false}
			message="Send this message?"
			arrow
			action={() => createMessage(parentId, text.trim())}
			disabled={!valid}
			onsuccess={() => {
				text = '';
			}}
		>
			<input
				type="text"
				aria-label="message"
				placeholder="message"
				maxlength="500"
				autocomplete="off"
				bind:value={text}
			/>
		</ActionConfirmation>
	{:else}
		<RouteLink href="/login" title="Log in to send a message" />
	{/if}
</div>

<style>
	.message p {
		padding: 0 2em 1em;
		overflow-wrap: anywhere;
	}
</style>

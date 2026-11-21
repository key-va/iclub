import {
	app,
	HttpRequest,
	HttpResponseInit,
	InvocationContext
} from '@azure/functions';
import { DefaultAzureCredential } from '@azure/identity';
import { TableClient, odata } from '@azure/data-tables';
import { resourceName, resourceSuffix } from '../stores/resourceNames';
import { doSignatureVerification } from '../services/doSignatureVerification';
import { doUpsertRelation } from '../services/doUpsertRelation';
import { doGuidsToPublic } from '../services/doGuidsToPublic';
import { doCompleteMatch } from '../services/doCompleteMatch';
import { doCompetitorUsers } from '../services/doCompetitorUsers';
import { doSendPush } from '../services/doSendPush';

const client = new TableClient(
	`https://${resourceName(resourceSuffix.storageAccount)}.table.core.windows.net`,
	'guids',
	new DefaultAzureCredential()
);
type Row = Record<string, any>;
const attrs = ({ partitionKey, rowKey, timestamp, etag, ...rest }: Row) => rest;
async function get(pk: string, rk: string): Promise<Row | undefined> {
	try {
		return await client.getEntity(pk, rk);
	} catch (error: any) {
		if (error.statusCode === 404) return undefined;
		throw error;
	}
}
async function links(id: string): Promise<Row[]> {
	const result = [];
	for await (const row of client.listEntities({
		queryOptions: { filter: odata`PartitionKey eq ${id}` }
	}))
		result.push(row);
	return result;
}
const admin = (row: Row) =>
	row.is_admin === true ||
	(row.is_admin === undefined && row.role === 'is_admin');
const reply = (
	status: number,
	message: string,
	subject?: string
): HttpResponseInit => ({
	status,
	jsonBody: { success: status < 400, message, ...(subject ? { subject } : {}) }
});

export async function membershipAction(
	request: HttpRequest,
	context: InvocationContext,
	type: 'ladder' | 'team' | 'group',
	action: 'away' | 'return' | 'leave'
): Promise<HttpResponseInit> {
	const id = request.params[`${type}_id`];
	let body;
	try {
		body = await request.json();
	} catch {
		return reply(400, 'Invalid JSON payload');
	}
	const { caller_id, device_id, signature } = body ?? {};
	if (
		typeof caller_id !== 'string' ||
		!caller_id.startsWith('user_') ||
		typeof device_id !== 'string' ||
		!device_id ||
		typeof signature !== 'string' ||
		!signature ||
		!id?.startsWith(`${type}_`)
	)
		return reply(400, 'Entity, user, device and signature are required');
	try {
		await doSignatureVerification(
			{ callerId: caller_id, deviceId: device_id, url: request.url, signature },
			context
		);
	} catch (error) {
		return reply(401, error instanceof Error ? error.message : 'Unauthorised');
	}
	const entity = await get(type, id);
	if (!entity) return reply(404, `${type} not found`);
	const mine = await get(id, caller_id);
	if (!mine || mine.state === 'left')
		return reply(409, `You are not associated with this ${type}`);

	const busyUntil = Math.max(
		Number(entity.operation_guard) || 0,
		Number(entity.operation_until) || 0
	);
	if (busyUntil > Date.now())
		return reply(409, 'Another operation is in progress; refresh and retry');
	try {
		await client.updateEntity(
			{ partitionKey: type, rowKey: id, operation_guard: Date.now() + 180000 },
			'Merge',
			{ etag: entity.etag }
		);
	} catch (error: any) {
		if (error.statusCode === 412 || error.statusCode === 409)
			return reply(409, 'Another operation is in progress; refresh and retry');
		throw error;
	}
	try {
		const current = await get(id, caller_id);
		if (!current || current.state === 'left')
			return reply(409, `You are not associated with this ${type}`);
		return await changeMembership(
			id,
			context,
			type,
			action,
			entity,
			current,
			caller_id
		);
	} finally {
		try {
			await client.updateEntity(
				{ partitionKey: type, rowKey: id, operation_guard: 0 },
				'Merge'
			);
		} catch (error) {
			context.warn('Membership operation guard release failed', error);
		}
	}
}

async function changeMembership(
	id: string,
	context: InvocationContext,
	type: 'ladder' | 'team' | 'group',
	action: 'away' | 'return' | 'leave',
	entity: Row,
	mine: Row,
	caller_id: string
): Promise<HttpResponseInit> {
	const all = await links(id);
	let competitor = caller_id;
	let users = [caller_id];
	if (type === 'ladder' && entity.format === 'doubles') {
		for (const pair of all.filter(
			(row) => row.rowKey.startsWith('pair_') && row.is_participant === true
		)) {
			const members = await doCompetitorUsers(client, pair.rowKey);
			if (members.includes(caller_id)) {
				competitor = pair.rowKey;
				users = members;
				break;
			}
		}
	}
	if (
		action === 'leave' &&
		all.some((row) => users.includes(row.rowKey) && admin(row)) &&
		!all.some(
			(row) =>
				row.rowKey.startsWith('user_') &&
				!users.includes(row.rowKey) &&
				admin(row)
		)
	)
		return reply(409, `The last ${type} administrator cannot leave`);
	if (
		action !== 'leave' &&
		(type !== 'ladder' ||
			mine.is_participant !== true ||
			(entity.format === 'doubles' && competitor === caller_id))
	)
		return reply(
			409,
			'Only a current ladder participant can change away status'
		);
	if (action === 'away' && mine.state === 'away')
		return reply(409, 'You are already away');
	if (action === 'return' && mine.state !== 'away')
		return reply(409, 'You are not away');

	const notifications = [];
	if (type === 'ladder' && action !== 'return') {
		for (const link of (await links(competitor)).filter((row) =>
			row.rowKey.startsWith('match_')
		)) {
			const match = await get('match', link.rowKey);
			if (!['pending', 'active'].includes(match?.state)) continue;
			// Only matches on this ladder; personal history may include other ladders.
			if (!(await links(link.rowKey)).some((row) => row.rowKey === id))
				continue;
			const result = await doCompleteMatch(
				{ matchId: link.rowKey, forfeiterId: competitor },
				context
			);
			if (!result.ok) return reply(result.status, result.message);
			notifications.push({
				userIds: result.userIds!,
				exceptUserId: caller_id,
				heading: result.matchName!,
				content: `Opponent ${action === 'away' ? 'went away' : 'left the ladder'}; match forfeited`,
				path: `match/${link.rowKey}`,
				collapseId: link.rowKey
			});
		}
	}
	if (action === 'leave') {
		if (type === 'ladder') {
			const current = attrs((await get(id, competitor)) ?? {});
			delete current.rank;
			delete current.points;
			await doUpsertRelation(id, competitor, {
				...current,
				is_participant: false,
				state: 'left'
			});
			const rankedType = entity.format === 'doubles' ? 'pair_' : 'user_';
			const standings = (await links(id))
				.filter(
					(row) =>
						row.rowKey.startsWith(rankedType) && row.is_participant === true
				)
				.sort((a, b) => Number(a.rank) - Number(b.rank));
			for (const [index, row] of standings.entries())
				if (row.rank !== index + 1)
					await doUpsertRelation(id, row.rowKey, {
						...attrs(row),
						rank: index + 1
					});
		}
		for (const user of users) {
			const membership = attrs((await get(id, user)) ?? {});
			delete membership.rank;
			delete membership.points;
			delete membership.role;
			await doUpsertRelation(id, user, {
				...membership,
				is_admin: false,
				is_participant: false,
				is_member: false,
				state: 'left'
			});
			if (type === 'team') {
				for (const round of all.filter((row) =>
					row.rowKey.startsWith('round_')
				)) {
					if ((await get('round', round.rowKey))?.state === 'complete')
						continue;
					const availability = await get(round.rowKey, user);
					if (availability)
						await doUpsertRelation(round.rowKey, user, {
							...attrs(availability),
							role: 'unavailable'
						});
				}
			}
		}
	} else {
		const personal = attrs((await get(id, caller_id)) ?? {});
		await doUpsertRelation(id, caller_id, {
			...personal,
			state:
				action === 'away'
					? 'away'
					: competitor === caller_id
						? 'cooling'
						: 'active'
		});
		if (competitor !== caller_id) {
			const pair = attrs((await get(id, competitor)) ?? {});
			const stillAway = (
				await Promise.all(users.map((user) => get(id, user)))
			).some((row) => row?.state === 'away');
			await doUpsertRelation(id, competitor, {
				...pair,
				state: stillAway ? 'away' : 'cooling'
			});
		}
	}
	await doGuidsToPublic();
	for (const notification of notifications)
		await doSendPush(notification, context);
	return reply(
		200,
		action === 'leave'
			? `You have left the ${type}`
			: action === 'away'
				? 'You are now away'
				: entity.format === 'doubles'
					? (await get(id, competitor))?.state === 'away'
						? 'You have returned; your partner is still away'
						: 'You have returned; the pair is cooling'
					: 'You have returned and are cooling',
		id
	);
}
app.http('ladderLeave', {
	methods: ['POST'],
	route: 'ladder/{ladder_id}/leave',
	authLevel: 'anonymous',
	handler: (request, context) =>
		membershipAction(request, context, 'ladder', 'leave')
});
app.http('ladderReturn', {
	methods: ['POST'],
	route: 'ladder/{ladder_id}/return',
	authLevel: 'anonymous',
	handler: (request, context) =>
		membershipAction(request, context, 'ladder', 'return')
});

import { guids, hrefOf, typeOf } from '#lib/stores/guids.ts';
import { API_URL } from '#lib/config.ts';
import { signRequest } from '#lib/stores/auth.ts';

// Every endpoint answers with this shape.
export interface ApiResponse<T = unknown> {
	success: boolean;
	message: string;
	subject?: string;
	data?: T;
}

// POST to an endpoint (e.g. "user/abc/update"). Signed calls identify the caller; pre-auth
// calls (otp, login, create) pass `signed: false` and carry everything in `data`.
export async function callApi<T = unknown>(
	endpoint: string,
	data: Record<string, unknown> = {},
	signed = true
): Promise<ApiResponse<T>> {
	const path = `/api/${endpoint.replace(/^\/+/, '')}`;
	const body: Record<string, unknown> = { data };

	if (signed) Object.assign(body, await signRequest(path));

	const response = await fetch(`${API_URL}/${endpoint.replace(/^\/+/, '')}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

	const result = (await response
		.json()
		.catch(() => null)) as ApiResponse<T> | null;

	if (!response.ok || !result?.success) {
		throw new Error(result?.message || 'request failed');
	}

	return result;
}

// Named mutations own their endpoint/payload and graph refresh. Components only
// execute callbacks; a returned subject is navigation data, not an instruction.
export type NavigationResponse<T = unknown> = ApiResponse<T> & {
	subject: string;
};

export class ActionRefreshError extends Error {
	constructor(
		message: string,
		public readonly retry: () => Promise<ApiResponse>
	) {
		super(message);
		this.name = 'ActionRefreshError';
	}
}

async function mutate(
	endpoint: string,
	data: Record<string, unknown> = {},
	signed = true
): Promise<ApiResponse> {
	const result = await callApi(endpoint, data, signed).catch(async (error: unknown) => {
		await guids.refresh().catch(() => {});
		throw error;
	});
	const response = result;
	const refresh = async (): Promise<ApiResponse> => {
		try {
			await guids.refresh();
			return response;
		} catch (error) {
			throw new ActionRefreshError(
				`${result.message} (could not refresh: ${error instanceof Error ? error.message : 'unknown error'})`,
				refresh
			);
		}
	};
	return refresh();
}

async function mutateWithSubject(
	endpoint: string,
	data: Record<string, unknown> = {},
	signed = true
): Promise<NavigationResponse> {
	const result = await mutate(endpoint, data, signed);
	if (!result.subject)
		throw new Error(
			'The action response did not include a navigation subject.'
		);
	return { ...result, subject: result.subject };
}

export const activateLadder = (ladderId: string) =>
	mutateWithSubject(`ladder/${ladderId}/activate`);
export const joinLadder = (ladderId: string) =>
	mutateWithSubject(`ladder/${ladderId}/join`);
export const acceptLadderMember = (ladderId: string, userId: string) =>
	mutate(`ladder/${ladderId}/accept`, { user_id: userId });
export const acceptLadderPair = (ladderId: string, userIds: [string, string]) =>
	mutate(`ladder/${ladderId}/accept`, { user_ids: userIds });
export const createMatch = (
	ladderId: string,
	challengerId: string,
	defenderId: string
) =>
	mutate('match/create', {
		ladder_id: ladderId,
		challenger_id: challengerId,
		defender_id: defenderId
	});

export const acceptTeamMember = (teamId: string, userId: string) =>
	mutate('team/accept', { team_id: teamId, user_id: userId });
export const acceptGroupMember = (groupId: string, userId: string) =>
	mutate(`group/${groupId}/accept`, { user_id: userId });
export const setRoundRole = (
	roundId: string,
	role: 'available' | 'unavailable' | 'selected',
	userId?: string
) =>
	mutate('round/role', {
		round_id: roundId,
		role,
		...(userId ? { user_id: userId } : {})
	});

export const updateClub = (id: string, data: Record<string, unknown>) =>
	mutateWithSubject(`club/${id}/update`, data);

export const createLadder = (data: Record<string, unknown>) =>
	mutateWithSubject('ladder/create', data);
export const updateLadder = (id: string, data: Record<string, unknown>) =>
	mutateWithSubject(`ladder/${id}/update`, data);
export const deleteLadder = (id: string) =>
	mutateWithSubject(`ladder/${id}/delete`);
export const createGroup = (data: Record<string, unknown>) =>
	mutateWithSubject('group/create', data);
export const updateComp = (id: string, data: Record<string, unknown>) =>
	mutateWithSubject(`comp/${id}/update`, data);
export const updateGroup = (id: string, data: Record<string, unknown>) =>
	mutateWithSubject(`group/${id}/update`, data);
export const activateGroup = (id: string) =>
	mutateWithSubject(`group/${id}/activate`);
export const joinGroup = (id: string) => mutateWithSubject(`group/${id}/join`);
export const createCompetition = (data: Record<string, unknown>) =>
	mutateWithSubject('comp/create', data);
export const competitionEntry = (
	id: string,
	action: 'activate' | 'join' | 'leave' | 'draw' | 'accept' | 'seed' | 'unseed',
	entrantId?: string
) => mutateWithSubject(`comp/${id}/${action}`,
	entrantId?.startsWith('pair_') ? { pair_id: entrantId } :
	entrantId ? { user_id: entrantId } : {});
export const acceptCompetitionPair = (id: string, userIds: string[]) =>
	mutateWithSubject(`comp/${id}/accept`, { user_ids: userIds });
export const recordElimResult = (
	id: string,
	matchId: string,
	action: 'score' | 'correct',
	firstId: string,
	secondId: string,
	result: { first_score: number[]; second_score: number[] }
) =>
	mutateWithSubject(`comp/${id}/${action}`, {
		match_id: matchId,
		first_id: firstId,
		second_id: secondId,
		...result
	});
export const forfeitCompetitionMatch = (
	id: string,
	matchId: string,
	firstId: string,
	secondId: string
) => mutateWithSubject(`comp/${id}/forfeit`, {
	match_id: matchId,
	first_id: firstId,
	second_id: secondId
});
export const createTeam = (data: Record<string, unknown>) =>
	mutateWithSubject('team/create', data);
export const activateTeam = (id: string) =>
	mutateWithSubject('team/activate', { team_id: id });
export const joinTeam = (id: string) =>
	mutateWithSubject('team/join', { team_id: id });
export const syncTeam = (id: string) => mutate('team/sync', { team_id: id });
export const acceptMatch = (id: string) =>
	mutateWithSubject(`match/${id}/accept`);
export const completeMatch = (id: string, data: Record<string, unknown>) =>
	mutateWithSubject(`match/${id}/complete`, data);
export const forfeitMatch = (id: string, data: Record<string, unknown> = {}) =>
	mutateWithSubject(`match/${id}/forfeit`, data);
export const withdrawMatch = (id: string) => mutate(`match/${id}/withdraw`);
export const retirePair = (id: string) =>
	mutateWithSubject(`pair/${id}/retire`);
export const updateUser = (id: string, data: Record<string, unknown>) =>
	mutateWithSubject(`user/${id}/update`, data);
export const deleteUser = (id: string) =>
	mutateWithSubject(`user/${id}/delete`);
export const createUser = (data: {
	name: string;
	email: string;
	phone?: string;
	key: string;
}) => mutateWithSubject('user/create', data, false);
export const loginUser = (data: { email: string; otp: string; key: string }) =>
	mutateWithSubject('user/login', data, false);
export const requestOtp = (email: string) =>
	callApi<{ exists: boolean }>('user/otp', { email }, false);
export const getTeamOptions = (data: Record<string, unknown>) =>
	callApi<{ kind: string; options: { id: string; name: string }[] }>(
		'team/options',
		data,
		false
	);
export const getSystemAbout = () =>
	callApi<{ version: string; WEB_PUSH_PUBLIC_KEY: string | null }>(
		'system/about',
		{},
		false
	);
export const updatePushSubscription = (
	subscription: PushSubscriptionJSON | null
) => callApi('user/push', { subscription });
export function createMessage(parentId: string, text: string) {
	const type = parentId.split('_')[0];
	if (!['match', 'round', 'group'].includes(type))
		throw new Error('Messages require a match, round or group');
	return mutate('message/create', { [`${type}_id`]: parentId, text });
}

// API subjects may identify an entity or a local destination for flows such as deletion.
export function navigationHref(subject: string): string {
	if (subject.startsWith('/')) {
		if (subject.startsWith('//') || subject.includes('\\'))
			throw new Error('Invalid navigation subject');
		return subject;
	}
	return hrefOf(subject);
}

export const awayLadder = (id: string) =>
	mutateWithSubject(`ladder/${id}/away`);
export const returnLadder = (id: string) =>
	mutateWithSubject(`ladder/${id}/return`);
export const leaveLadder = (id: string) =>
	mutateWithSubject(`ladder/${id}/leave`);
export const leaveTeam = (id: string) => mutateWithSubject(`team/${id}/leave`);
export const leaveGroup = (id: string) =>
	mutateWithSubject(`group/${id}/leave`);

export const confirmRoundRole = (
	id: string,
	role: 'available' | 'unavailable'
) => mutateWithSubject('round/role', { round_id: id, role });

export const createMatchConfirmation = (
	id: string,
	challenger: string,
	defender: string
) =>
	mutateWithSubject('match/create', {
		ladder_id: id,
		challenger_id: challenger,
		defender_id: defender
	});
export const acceptLadderMemberConfirmation = (id: string, user: string) =>
	mutateWithSubject(`ladder/${id}/accept`, { user_id: user });
export const acceptTeamMemberConfirmation = (id: string, user: string) =>
	mutateWithSubject('team/accept', { team_id: id, user_id: user });

export const updateTeam = (id: string, data: { image: string }) =>
	mutateWithSubject(`team/${id}/update`, data);

export const rejectJoinRequest = (id: string, userId: string) =>
	mutate(`${typeOf(id)}/${id}/reject`, { user_id: userId });

export const rejectCreationRequest = (id: string) =>
	mutateWithSubject(`${typeOf(id)}/${id}/reject-creation`);

import { relatedEntities, relationsOf, type GuidRow } from '#lib/stores/guids.ts';
import { ladderSettingDefaults } from '#lib/strings.ts';

type Relation = Record<string, unknown>;

export interface ChallengeTarget {
	rk: string;
	rank: number;
	relation: Relation;
}

// Whether the target sits within the caller's reach under the ladder system, ignoring either player's state.
// win_points costs one point per rank climbed.
export function inReach(
	ladder: Record<string, unknown> | undefined,
	me: Relation | undefined,
	callerId: string | null,
	target: ChallengeTarget
) {
	if (!me || me.is_participant !== true || target.rk === callerId) return false;
	const myRank = Number(me.rank);
	const steps = myRank - target.rank;
	if (!(steps > 0)) return false;
	const system = String(ladder?.ladder_system ?? ladderSettingDefaults.ladder_system);
	if (system === 'win_points') return Number(me.points) >= steps;
	if (system === 'half_rank') return steps <= Math.floor(myRank / 2);
	const range = Number(system.match(/^static_range_(\d+)$/)?.[1]);
	return steps <= range;
}

// Whether the caller may issue a challenge to the target right now (match state is checked separately)
export function canChallenge(
	ladder: Record<string, unknown> | undefined,
	me: Relation | undefined,
	callerId: string | null,
	target: ChallengeTarget
) {
	if (me?.state !== 'active') return false;
	if (target.relation.is_participant !== true || !['active', 'cooling'].includes(String(target.relation.state))) return false;
	return inReach(ladder, me, callerId, target);
}

// User membership/admin flags stay separate from pair competitive standings.
export function ladderMembership(items: GuidRow[], ladder: GuidRow, userId: string | null) {
	const userRelation = relationsOf(items, ladder.rk).find(row => row.rk === userId);
	const pair = ladder.format === 'doubles' && userId
		? relatedEntities(items, ladder.rk, 'pair').find(candidate =>
			candidate.relation.is_participant === true &&
			relatedEntities(items, candidate.rk, 'user').some(member => member.rk === userId))
		: undefined;
	return {
		userRelation,
		pair,
		relation: ladder.format === 'doubles' ? pair?.relation : userRelation,
		competitorId: ladder.format === 'doubles' ? pair?.rk ?? null : userId,
	};
}

export const ladderStateColours: Record<string, string> = {
	away: 'red', busy: 'gold', cooling: 'blue', active: 'green',
};

export function challengeDescription(target: Pick<ChallengeTarget, 'rk' | 'relation'>, competitorId: string | null, eligible: boolean) {
	const state = String(target.relation.state);
	if (target.rk === competitorId) return state === 'active' ? 'available' : state;
	if (state === 'away') return 'away';
	if (state === 'busy') return 'in a match';
	return eligible ? 'long tap to challenge' : 'cannot challenge';
}

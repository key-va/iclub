// Keep identical to app/src/lib/strings.ts (API validates, app generates the form).

export type LadderSetting =
    | { type: "enum"; label: string; default: string; description: string; values: Record<string, string> }
    | { type: "number"; label: string; default: number; description: string; min: number; max: number };

export const ladderSettings: Record<string, LadderSetting> = {
    "format": {
        type: "enum",
        label: "format",
        default: "singles",
        description: "whether players compete alone or in pairs",
        values: {
            "singles": "one player per side",
            "doubles": "two players per side"
        }
    },
    "match_format": {
        type: "enum",
        label: "match format",
        default: "super_set",
        description: "how a challenge match is played",
        values: {
            "super_set": "a single long set played to 8 with a tiebreak at 7 games each",
            "best_of_three": "first to win two full sets to 6, with super tiebreak to 10 at 1 set each",
            "fast_four": "first to win two short sets to 4, with tiebreak at 3 games each and one fault per service game"
        }
    },
    "ladder_system": {
        type: "enum",
        label: "ladder system",
        default: "win_points",
        description: "how results move players up and down the ladder",
        values: {
            "win_points": "players earn points with match wins and trade points to challenge others",
            "half_rank": "players can challenge up to half their own rank above them",
            "static_range_1": "players may challenge up to 1 rank above them",
            "static_range_3": "players may challenge up to 3 ranks above them",
            "static_range_6": "players may challenge up to 6 ranks above them"
        }
    },
    "cool_period": {
        type: "number",
        label: "cool period",
        default: 2,
        description: "days a losing player must wait before issuing another challenge",
        min: 0,
        max: 9
    },
    "play_period": {
        type: "number",
        label: "play period",
        default: 9,
        description: "days allowed to play an accepted challenge",
        min: 1,
        max: 28
    }
};

export const ladderSettingDefaults: Record<string, string | number> = Object.fromEntries(
    Object.entries(ladderSettings).map(([key, setting]) => [key, setting.default])
);

export const ladderStates: Record<string, string> = {
    pending: "waiting for the club admin to approve the ladder",
    active: "approved and open for play",
    complete: "finished and closed"
};

// A player's state on a ladder, held on the user ↔ ladder relation
export const ladderPlayerStates: Record<string, string> = {
    active: "available to challenge and be challenged",
    cooling: "serving the cool period after a loss",
    busy: "in an accepted challenge that is yet to be played",
    away: "temporarily unavailable"
};

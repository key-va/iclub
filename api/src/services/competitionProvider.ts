// Provider-owned data only. Memberships, availability and messages never enter this contract.
export interface CompetitionOption {
    id: string;
    name: string;
}
export interface TeamMapping {
    provider: string;
    association: string;
    competition: string;
    section: string;
    external_team: string;
    season: string;
}
export interface OfficialRound {
    number: number;
    date: string;
    opponent: string;
    home_away: string;
    venue: string;
    status: string;
    external_match?: string;
    points_for?: number;
    points_against?: number;
    sets_for?: number;
    sets_against?: number;
    games_for?: number;
    games_against?: number;
}
export interface Standing {
    name: string;
    rank: number;
    wins: number;
    points: number;
    percentage: number;
}
export interface CompetitionSnapshot {
    rounds: OfficialRound[];
    standings: Standing[];
    calendar: { date: string; name: string }[];
}
export interface CompetitionProvider {
    options(input: {
        association: string;
        competition?: string;
        section?: string;
    }): Promise<{ kind: string; options: CompetitionOption[] }>;
    resolve(input: {
        association: string;
        competition: string;
        section: string;
        team: string;
    }): Promise<
        TeamMapping & {
            name: string;
            competition_name: string;
            section_name: string;
        }
    >;
    snapshot(mapping: TeamMapping): Promise<CompetitionSnapshot>;
}

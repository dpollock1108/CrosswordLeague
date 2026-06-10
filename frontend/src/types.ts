export type UserPublic = {
  id: number;
  email: string;
  display_name: string;
  handle?: string | null;
  avatar_url?: string | null;
  player_id?: number | null;
  is_admin: boolean;
};

export type AuthResponse = {
  access_token: string;
  user: UserPublic;
};

export type LeaderboardEntry = {
  player_id: number;
  name: string;
  handle?: string | null;
  total_points: number;
  puzzles_played: number;
  average_seconds?: number | null;
  best_seconds?: number | null;
};

export type LeaderboardResponse = {
  start_date: string;
  end_date: string;
  entries: LeaderboardEntry[];
};

export type PlayerStats = {
  player: {
    id: number;
    name: string;
    handle?: string | null;
    email?: string | null;
    created_at: string;
  };
  puzzles_played: number;
  average_seconds?: number | null;
  best_seconds?: number | null;
  last_puzzle_date?: string | null;
  total_points: number;
  best_day_of_week?: string | null;
  weekday_averages?: Record<string, number> | null;
};

export type Player = {
  id: number;
  name: string;
  handle?: string | null;
  email?: string | null;
  nyt_username?: string | null;
};

export type PuzzleResultInput = {
  player_id: number;
  puzzle_date: string;
  seconds: number;
  points_override?: number | null;
  note?: string | null;
  source?: string | null;
};

export type WallOfShameEntry = {
  player_id: number;
  name: string;
  handle?: string | null;
  missing_dates: string[];
  missing_count: number;
};

export type WallOfShameResponse = {
  start_date: string;
  end_date: string;
  scope: "week" | "month";
  entries: WallOfShameEntry[];
};

export type ParsedLeaderboardEntry = {
  nyt_username: string;
  time_str: string;
  seconds: number;
  player_id: number | null;
  player_name: string | null;
  matched: boolean;
};

export type ScreenshotParseResponse = {
  puzzle_date: string;
  parsed: ParsedLeaderboardEntry[];
  matched_count: number;
  unmatched_count: number;
};

// League types
export type LeagueVisibility = "public" | "private";

export type LeaguePublic = {
  id: number;
  name: string;
  invite_code: string;
  creator_id: number;
  visibility: LeagueVisibility;
  member_count: number;
  role?: string | null;
  membership_status?: string | null; // "active" | "pending" for current user
  created_at: string;
};

export type LeagueJoinResult = {
  league: LeaguePublic;
  status: "active" | "pending";
};

export type LeagueMemberPublic = {
  user_id: number;
  display_name: string;
  handle?: string | null;
  player_id?: number | null;
  role: string;
  status: string;
  joined_at: string;
};

export type LeagueDetail = LeaguePublic & {
  members: LeagueMemberPublic[];
  pending_requests: LeagueMemberPublic[];
};

export type ScoringTier = {
  max_seconds: number | null; // null = catch-all (anyone slower)
  points: number;
};

export type CategoryScoring = {
  tiers: ScoringTier[];
  bonus: number;
};

export type LeagueScoringConfig = {
  mini: CategoryScoring;
  medium: CategoryScoring;
};

// Puzzle types
export type GridCell = {
  letter: string;
  is_black: boolean;
};

export type Clue = {
  number: number;
  clue: string;
  answer?: string; // only present in admin views
  row: number;
  col: number;
  length: number;
};

export type CluesData = {
  across: Clue[];
  down: Clue[];
};

export type GridData = {
  cells: GridCell[][];
};

export type PuzzlePublic = {
  id: number;
  puzzle_type: string;
  puzzle_date: string;
  size: number;
  grid_data: string; // JSON string
  clues_data: string; // JSON string
  title?: string | null;
  difficulty?: string | null;
  status: string;
  created_at: string;
};

export type SolveAttempt = {
  id: number;
  puzzle_id: number;
  started_at: string;
  completed_at?: string | null;
  seconds?: number | null;
  grid_state?: string | null;
  is_complete: boolean;
};

export type PuzzleTodayResponse = {
  puzzle: PuzzlePublic;
  attempt?: SolveAttempt | null;
};

export type SubmitResult = {
  correct: boolean;
  seconds?: number | null;
  points?: number | null;
  errors?: Array<{ row: number; col: number }> | null;
};

export type PuzzleAdminPublic = {
  id: number;
  puzzle_type: string;
  puzzle_date: string;
  size: number;
  grid_data: string;
  clues_data: string;
  title?: string | null;
  difficulty?: string | null;
  status: string;
  created_by?: string | null;
  created_at: string;
  published_at?: string | null;
};

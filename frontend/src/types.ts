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
  puzzle_date: string | null;
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

export type PuzzleArchiveEntry = {
  id: number;
  puzzle_type: string;
  puzzle_date: string | null;
  title?: string | null;
  status: "not_started" | "in_progress" | "complete";
  seconds?: number | null;
};

export type PuzzleArchiveResponse = {
  week: PuzzleArchiveEntry[];
  completed: PuzzleArchiveEntry[];
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
  puzzle_date: string | null;
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

// ---------------------------------------------------------------------------
// Friends
// ---------------------------------------------------------------------------

export type Friend = {
  user_id: number;
  display_name: string;
  handle?: string | null;
  avatar_url?: string | null;
  friends_since: string;
};

export type FriendRequest = {
  user_id: number;
  display_name: string;
  handle?: string | null;
  avatar_url?: string | null;
  requested_at: string;
};

export type FriendListResponse = {
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
};

export type FriendRequestResult = {
  status: "pending" | "accepted";
  friend: FriendRequest;
};

// ---------------------------------------------------------------------------
// QOTD — question of the day
// ---------------------------------------------------------------------------

export type QotdScope = "friends" | "league";

export type QotdQuestion = {
  id: number;
  prompt: string;
  choices: string[];
  category?: string | null;
  difficulty?: string | null;
  question_date: string;
  submitted_by_handle?: string | null;
};

export type QotdAttempt = {
  question_id: number;
  question_date: string;
  started_at: string;
  answered_at?: string | null;
  seconds?: number | null;
  selected_index?: number | null;
  is_correct?: boolean | null;
  points: number;
};

export type QotdToday = {
  question?: QotdQuestion | null;
  attempt?: QotdAttempt | null;
  answer_index?: number | null;
  explanation?: string | null;
  streak: number;
};

export type QotdAnswerResult = {
  is_correct: boolean;
  answer_index: number;
  selected_index: number;
  seconds: number;
  points: number;
  streak: number;
  explanation?: string | null;
};

export type QotdBoardEntry = {
  user_id: number;
  display_name: string;
  handle?: string | null;
  avatar_url?: string | null;
  status: "answered" | "playing" | "not_started";
  is_correct?: boolean | null;
  seconds?: number | null;
  points?: number | null;
  is_you: boolean;
};

export type QotdBoard = {
  question_date: string;
  scope: QotdScope;
  league_id?: number | null;
  revealed: boolean;
  entries: QotdBoardEntry[];
};

export type QotdLeaderboardEntry = {
  user_id: number;
  display_name: string;
  handle?: string | null;
  avatar_url?: string | null;
  total_points: number;
  played: number;
  correct: number;
  accuracy?: number | null;
  average_seconds?: number | null;
  best_seconds?: number | null;
  current_streak: number;
  is_you: boolean;
};

export type QotdLeaderboard = {
  start_date: string;
  end_date: string;
  scope: QotdScope;
  league_id?: number | null;
  entries: QotdLeaderboardEntry[];
};

export type QotdStats = {
  played: number;
  correct: number;
  accuracy?: number | null;
  average_seconds?: number | null;
  best_seconds?: number | null;
  total_points: number;
  current_streak: number;
  longest_streak: number;
  submitted: number;
  submissions_live: number;
};

export type QotdVerification = {
  verdict?: "approve" | "needs_review" | "reject" | null;
  confidence?: number | null;
  notes?: string | null;
  verified_at?: string | null;
};

export type QotdSubmission = {
  id: number;
  prompt: string;
  choices: string[];
  answer_index: number;
  explanation?: string | null;
  category?: string | null;
  difficulty?: string | null;
  source_url?: string | null;
  status: "pending" | "approved" | "needs_review" | "rejected" | "scheduled";
  question_date?: string | null;
  verification: QotdVerification;
  created_at: string;
};

export type QotdAdminQuestion = QotdSubmission & {
  submitted_by?: number | null;
  submitted_by_handle?: string | null;
};

export type QotdSubmissionResult = {
  submission: QotdSubmission;
  message: string;
};

export type QotdSubmitInput = {
  prompt: string;
  choices: string[];
  answer_index: number;
  explanation?: string | null;
  category?: string | null;
  difficulty?: string | null;
  source_url?: string | null;
};

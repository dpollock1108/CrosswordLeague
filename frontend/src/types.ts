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
  points_table: number[];
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

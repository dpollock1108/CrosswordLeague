import type {
  LeaderboardResponse,
  Player,
  PlayerStats,
  PuzzleResultInput,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = {
    "Content-Type": "application/json",
    ...(init?.headers || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return (await res.json()) as T;
}

export async function fetchLeaderboard(params?: { startDate?: string; endDate?: string }): Promise<LeaderboardResponse> {
  const search = new URLSearchParams();
  if (params?.startDate) search.append("start_date", params.startDate);
  if (params?.endDate) search.append("end_date", params.endDate);
  const qs = search.toString();
  return http<LeaderboardResponse>(`/leaderboard${qs ? `?${qs}` : ""}`);
}

export async function fetchPlayers(): Promise<Player[]> {
  return http<Player[]>("/players");
}

export async function fetchPlayerStats(id: number): Promise<PlayerStats> {
  return http<PlayerStats>(`/players/${id}/stats`);
}

export async function fetchResultsByDate(token: string, puzzleDate: string) {
  return http<PuzzleResultInput[]>("/results?" + new URLSearchParams({ puzzle_date: puzzleDate }).toString(), {
    headers: {
      "X-Admin-Token": token,
    },
  });
}

export async function submitResults(
  token: string,
  payload: PuzzleResultInput[],
  overwrite_existing = true,
) {
  return http("/results", {
    method: "POST",
    headers: {
      "X-Admin-Token": token,
    },
    body: JSON.stringify({
      overwrite_existing,
      results: payload,
    }),
  });
}

export async function createPlayer(token: string, payload: { name: string; handle?: string; email?: string }) {
  return http<Player>("/players", {
    method: "POST",
    headers: {
      "X-Admin-Token": token,
    },
    body: JSON.stringify(payload),
  });
}

export async function updatePlayer(
  token: string,
  playerId: number,
  payload: { name: string; handle?: string; email?: string; nyt_username?: string },
) {
  return http<Player>(`/players/${playerId}`, {
    method: "PUT",
    headers: {
      "X-Admin-Token": token,
    },
    body: JSON.stringify(payload),
  });
}

export async function submitSingleResult(
  token: string,
  payload: {
    player_id: number;
    puzzle_date: string;
    seconds: number;
    points_override?: number | null;
    note?: string | null;
    source?: string | null;
  },
) {
  return http("/results/single", {
    method: "POST",
    headers: {
      "X-Admin-Token": token,
    },
    body: JSON.stringify(payload),
  });
}

export async function importResultsCsv(
  token: string,
  rows: Array<{
    player_id: number;
    puzzle_date: string;
    seconds: number;
    points_override?: number | null;
    note?: string | null;
    source?: string | null;
  }>,
  overwrite_existing = true,
) {
  return http("/results/import-csv?" + new URLSearchParams({ overwrite_existing: String(overwrite_existing) }), {
    method: "POST",
    headers: {
      "X-Admin-Token": token,
    },
    body: JSON.stringify(rows),
  });
}

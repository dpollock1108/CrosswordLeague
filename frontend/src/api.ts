import type {
  AuthResponse,
  LeaderboardResponse,
  LeagueDetail,
  LeagueJoinResult,
  LeaguePublic,
  LeagueScoringConfig,
  LeagueVisibility,
  Player,
  PlayerStats,
  PuzzleAdminPublic,
  PuzzleResultInput,
  PuzzleTodayResponse,
  ScreenshotParseResponse,
  SolveAttempt,
  SubmitResult,
  UserPublic,
  WallOfShameResponse,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return (await res.json()) as T;
}

// Auth
export async function loginWithGoogle(idToken: string): Promise<AuthResponse> {
  return http<AuthResponse>("/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken }),
  });
}

export async function fetchCurrentUser(jwt: string): Promise<UserPublic> {
  return http<UserPublic>("/auth/me", {
    headers: { Authorization: `Bearer ${jwt}` },
  });
}

export async function updateProfile(
  jwt: string,
  data: { display_name?: string; handle?: string },
): Promise<UserPublic> {
  return http<UserPublic>("/auth/me", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
}

export async function fetchLeaderboard(params?: {
  startDate?: string;
  endDate?: string;
  puzzleTypes?: string[];
}): Promise<LeaderboardResponse> {
  const search = new URLSearchParams();
  if (params?.startDate) search.append("start_date", params.startDate);
  if (params?.endDate) search.append("end_date", params.endDate);
  for (const t of params?.puzzleTypes || []) search.append("puzzle_type", t);
  const qs = search.toString();
  return http<LeaderboardResponse>(`/leaderboard${qs ? `?${qs}` : ""}`);
}

export async function fetchPlayers(): Promise<Player[]> {
  return http<Player[]>("/players");
}

export async function fetchPlayerStats(id: number): Promise<PlayerStats> {
  return http<PlayerStats>(`/players/${id}/stats`);
}

export async function fetchWallOfShame(params: { scope: "week" | "month"; startDate: string; endDate: string }) {
  const search = new URLSearchParams({
    scope: params.scope,
    start_date: params.startDate,
    end_date: params.endDate,
  });
  return http<WallOfShameResponse>(`/wall-of-shame?${search.toString()}`);
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
      "Content-Type": "application/json",
      "X-Admin-Token": token,
    },
    body: JSON.stringify({
      overwrite_existing,
      results: payload,
    }),
  });
}

export async function createPlayer(token: string, payload: { name: string; handle?: string; email?: string; nyt_username?: string }) {
  return http<Player>("/players", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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
      "Content-Type": "application/json",
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
      "Content-Type": "application/json",
      "X-Admin-Token": token,
    },
    body: JSON.stringify(payload),
  });
}

export async function parseScreenshot(
  token: string,
  image: File,
  puzzleDate: string,
): Promise<ScreenshotParseResponse> {
  const formData = new FormData();
  formData.append("image", image);
  formData.append("puzzle_date", puzzleDate);

  const res = await fetch(`${API_BASE}/results/parse-screenshot`, {
    method: "POST",
    headers: { "X-Admin-Token": token },
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return (await res.json()) as ScreenshotParseResponse;
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
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  return http<{ imported: number; skipped: number; errors: string[] }>("/results/import-csv?" + new URLSearchParams({ overwrite_existing: String(overwrite_existing) }), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Token": token,
    },
    body: JSON.stringify(rows),
  });
}

// Puzzle endpoints
export async function fetchTodayPuzzle(jwt: string, type: string = "mini_5x5"): Promise<PuzzleTodayResponse> {
  return http<PuzzleTodayResponse>(`/puzzles/today?type=${encodeURIComponent(type)}`, {
    headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
  });
}

export async function fetchPuzzle(jwt: string, puzzleId: number): Promise<PuzzleTodayResponse> {
  return http<PuzzleTodayResponse>(`/puzzles/${puzzleId}`, {
    headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
  });
}

export async function startSolve(jwt: string, puzzleId: number): Promise<SolveAttempt> {
  return http<SolveAttempt>(`/puzzles/${puzzleId}/start`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
  });
}

export async function saveProgress(jwt: string, puzzleId: number, gridState: string): Promise<SolveAttempt> {
  return http<SolveAttempt>(`/puzzles/${puzzleId}/save`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ grid_state: gridState }),
  });
}

export async function submitSolve(jwt: string, puzzleId: number, gridState: string): Promise<SubmitResult> {
  return http<SubmitResult>(`/puzzles/${puzzleId}/submit`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ grid_state: gridState }),
  });
}

// Admin puzzle endpoints (use JWT auth)
export async function listPuzzlesAdmin(
  jwt: string,
  params?: { status?: string; puzzle_type?: string },
): Promise<PuzzleAdminPublic[]> {
  const search = new URLSearchParams();
  if (params?.status) search.append("status", params.status);
  if (params?.puzzle_type) search.append("puzzle_type", params.puzzle_type);
  const qs = search.toString();
  return http<PuzzleAdminPublic[]>(`/puzzles/admin/list${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
}

export async function generatePuzzleAdmin(
  jwt: string,
  data: { puzzle_type: string; puzzle_date: string; difficulty: string },
): Promise<PuzzleAdminPublic> {
  return http<PuzzleAdminPublic>("/puzzles/generate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
}

export async function createPuzzleAdmin(
  jwt: string,
  data: {
    puzzle_type: string;
    puzzle_date: string;
    size: number;
    grid_data: string;
    clues_data: string;
    title?: string;
    difficulty?: string;
  },
): Promise<PuzzleAdminPublic> {
  return http<PuzzleAdminPublic>("/puzzles", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
}

export async function publishPuzzleAdmin(
  jwt: string,
  puzzleId: number,
): Promise<PuzzleAdminPublic> {
  return http<PuzzleAdminPublic>(`/puzzles/${puzzleId}/publish`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
  });
}

export async function deletePuzzleAdmin(
  jwt: string,
  puzzleId: number,
): Promise<void> {
  await fetch(`${API_BASE}/puzzles/${puzzleId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${jwt}` },
  }).then((res) => {
    if (!res.ok) return res.text().then((t) => { throw new Error(t || res.statusText); });
  });
}

// League endpoints (JWT auth)
export async function listLeagues(jwt: string): Promise<LeaguePublic[]> {
  return http<LeaguePublic[]>("/leagues", {
    headers: { Authorization: `Bearer ${jwt}` },
  });
}

export async function createLeague(
  jwt: string,
  name: string,
  visibility: LeagueVisibility = "private",
): Promise<LeaguePublic> {
  return http<LeaguePublic>("/leagues", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, visibility }),
  });
}

export async function joinLeague(jwt: string, inviteCode: string): Promise<LeagueJoinResult> {
  return http<LeagueJoinResult>("/leagues/join", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ invite_code: inviteCode }),
  });
}

export async function updateLeagueVisibility(
  jwt: string,
  leagueId: number,
  visibility: LeagueVisibility,
): Promise<LeaguePublic> {
  return http<LeaguePublic>(`/leagues/${leagueId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ visibility }),
  });
}

export async function approveLeagueRequest(jwt: string, leagueId: number, userId: number): Promise<void> {
  await fetch(`${API_BASE}/leagues/${leagueId}/requests/${userId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
  }).then((res) => {
    if (!res.ok) return res.text().then((t) => { throw new Error(t || res.statusText); });
  });
}

export async function denyLeagueRequest(jwt: string, leagueId: number, userId: number): Promise<void> {
  await fetch(`${API_BASE}/leagues/${leagueId}/requests/${userId}/deny`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
  }).then((res) => {
    if (!res.ok) return res.text().then((t) => { throw new Error(t || res.statusText); });
  });
}

export async function fetchLeague(jwt: string, leagueId: number): Promise<LeagueDetail> {
  return http<LeagueDetail>(`/leagues/${leagueId}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
}

export async function fetchLeagueLeaderboard(
  jwt: string,
  leagueId: number,
  params?: { startDate?: string; endDate?: string; puzzleTypes?: string[] },
): Promise<LeaderboardResponse> {
  const search = new URLSearchParams();
  if (params?.startDate) search.append("start_date", params.startDate);
  if (params?.endDate) search.append("end_date", params.endDate);
  for (const t of params?.puzzleTypes || []) search.append("puzzle_type", t);
  const qs = search.toString();
  return http<LeaderboardResponse>(`/leagues/${leagueId}/leaderboard${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
}

export async function renameLeague(jwt: string, leagueId: number, name: string): Promise<LeaguePublic> {
  return http<LeaguePublic>(`/leagues/${leagueId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function deleteLeague(jwt: string, leagueId: number): Promise<void> {
  await fetch(`${API_BASE}/leagues/${leagueId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${jwt}` },
  }).then((res) => {
    if (!res.ok) return res.text().then((t) => { throw new Error(t || res.statusText); });
  });
}

export async function removeLeagueMember(jwt: string, leagueId: number, userId: number): Promise<void> {
  await fetch(`${API_BASE}/leagues/${leagueId}/members/${userId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${jwt}` },
  }).then((res) => {
    if (!res.ok) return res.text().then((t) => { throw new Error(t || res.statusText); });
  });
}

export async function fetchLeagueScoringConfig(
  jwt: string,
  leagueId: number,
): Promise<LeagueScoringConfig> {
  return http<LeagueScoringConfig>(`/leagues/${leagueId}/scoring-config`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
}

export async function updateLeagueScoringConfig(
  jwt: string,
  leagueId: number,
  config: LeagueScoringConfig,
): Promise<LeagueScoringConfig> {
  return http<LeagueScoringConfig>(`/leagues/${leagueId}/scoring-config`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
}

export async function leaveLeague(jwt: string, leagueId: number): Promise<void> {
  await fetch(`${API_BASE}/leagues/${leagueId}/membership`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${jwt}` },
  }).then((res) => {
    if (!res.ok) return res.text().then((t) => { throw new Error(t || res.statusText); });
  });
}

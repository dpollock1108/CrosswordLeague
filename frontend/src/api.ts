import type {
  AuthResponse,
  FriendListResponse,
  FriendRequestResult,
  LeaderboardResponse,
  LeagueDetail,
  LeagueJoinResult,
  LeaguePublic,
  LeagueScoringConfig,
  LeagueVisibility,
  Player,
  PlayerStats,
  PuzzleAdminPublic,
  PuzzleArchiveResponse,
  PuzzleResultInput,
  PuzzleTodayResponse,
  QotdAdminQuestion,
  QotdAnswerResult,
  QotdBoard,
  QotdLeaderboard,
  QotdScope,
  QotdStats,
  QotdSubmission,
  QotdSubmissionResult,
  QotdSubmitInput,
  QotdToday,
  QotdTracksResponse,
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

export async function fetchResultsByDate(jwt: string, puzzleDate: string) {
  return http<PuzzleResultInput[]>("/results?" + new URLSearchParams({ puzzle_date: puzzleDate }).toString(), {
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
  });
}

export async function submitResults(
  jwt: string,
  payload: PuzzleResultInput[],
  overwrite_existing = true,
) {
  return http("/results", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      overwrite_existing,
      results: payload,
    }),
  });
}

export async function createPlayer(jwt: string, payload: { name: string; handle?: string; email?: string; nyt_username?: string }) {
  return http<Player>("/players", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function updatePlayer(
  jwt: string,
  playerId: number,
  payload: { name: string; handle?: string; email?: string; nyt_username?: string },
) {
  return http<Player>(`/players/${playerId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function submitSingleResult(
  jwt: string,
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
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function parseScreenshot(
  jwt: string,
  image: File,
  puzzleDate: string,
): Promise<ScreenshotParseResponse> {
  const formData = new FormData();
  formData.append("image", image);
  formData.append("puzzle_date", puzzleDate);

  const res = await fetch(`${API_BASE}/results/parse-screenshot`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return (await res.json()) as ScreenshotParseResponse;
}

export async function importResultsCsv(
  jwt: string,
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
      Authorization: `Bearer ${jwt}`,
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

export async function fetchPuzzleArchive(jwt: string, type: string = "mini_5x5"): Promise<PuzzleArchiveResponse> {
  return http<PuzzleArchiveResponse>(`/puzzles/archive?type=${encodeURIComponent(type)}`, {
    headers: { Authorization: `Bearer ${jwt}` },
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
  data: { puzzle_type: string; difficulty: string },
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

export async function assignPuzzleAdmin(
  jwt: string,
  puzzleId: number,
  puzzleDate: string,
): Promise<PuzzleAdminPublic> {
  return http<PuzzleAdminPublic>(`/puzzles/${puzzleId}/assign`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ puzzle_date: puzzleDate }),
  });
}

export async function unassignPuzzleAdmin(
  jwt: string,
  puzzleId: number,
): Promise<PuzzleAdminPublic> {
  return http<PuzzleAdminPublic>(`/puzzles/${puzzleId}/unassign`, {
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

export async function fetchLeagueWallOfShame(
  jwt: string,
  leagueId: number,
  params: { scope: "week" | "month"; startDate?: string; endDate?: string },
): Promise<WallOfShameResponse> {
  const search = new URLSearchParams({ scope: params.scope });
  if (params.startDate) search.append("start_date", params.startDate);
  if (params.endDate) search.append("end_date", params.endDate);
  return http<WallOfShameResponse>(`/leagues/${leagueId}/wall-of-shame?${search.toString()}`, {
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

export async function promoteLeagueMember(jwt: string, leagueId: number, userId: number): Promise<void> {
  await fetch(`${API_BASE}/leagues/${leagueId}/members/${userId}/promote`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
  }).then((res) => {
    if (!res.ok) return res.text().then((t) => { throw new Error(t || res.statusText); });
  });
}

export async function demoteLeagueMember(jwt: string, leagueId: number, userId: number): Promise<void> {
  await fetch(`${API_BASE}/leagues/${leagueId}/members/${userId}/demote`, {
    method: "POST",
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

// ---------------------------------------------------------------------------
// Friends
// ---------------------------------------------------------------------------

const authJson = (jwt: string) => ({
  Authorization: `Bearer ${jwt}`,
  "Content-Type": "application/json",
});

async function httpVoid(path: string, init: RequestInit): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
}

export async function fetchFriends(jwt: string): Promise<FriendListResponse> {
  return http<FriendListResponse>("/friends", {
    headers: { Authorization: `Bearer ${jwt}` },
  });
}

export async function sendFriendRequest(jwt: string, handle: string): Promise<FriendRequestResult> {
  return http<FriendRequestResult>("/friends/requests", {
    method: "POST",
    headers: authJson(jwt),
    body: JSON.stringify({ handle }),
  });
}

export async function acceptFriendRequest(jwt: string, requesterId: number): Promise<void> {
  return httpVoid(`/friends/requests/${requesterId}/accept`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
  });
}

export async function declineFriendRequest(jwt: string, requesterId: number): Promise<void> {
  return httpVoid(`/friends/requests/${requesterId}/decline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
  });
}

export async function cancelFriendRequest(jwt: string, addresseeId: number): Promise<void> {
  return httpVoid(`/friends/requests/${addresseeId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${jwt}` },
  });
}

export async function removeFriend(jwt: string, friendId: number): Promise<void> {
  return httpVoid(`/friends/${friendId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${jwt}` },
  });
}

// ---------------------------------------------------------------------------
// QOTD
// ---------------------------------------------------------------------------

function scopeQuery(scope: QotdScope, leagueId?: number | null): string {
  const search = new URLSearchParams({ scope });
  if (scope === "league" && leagueId != null) search.set("league_id", String(leagueId));
  return search.toString();
}

export async function fetchQotdTracks(jwt: string): Promise<QotdTracksResponse> {
  return http<QotdTracksResponse>("/qotd/tracks", { headers: { Authorization: `Bearer ${jwt}` } });
}

export async function fetchQotdToday(jwt: string, track?: string): Promise<QotdToday> {
  const qs = track ? `?${new URLSearchParams({ track }).toString()}` : "";
  return http<QotdToday>(`/qotd/today${qs}`, { headers: { Authorization: `Bearer ${jwt}` } });
}

export async function startQotd(jwt: string, questionId: number): Promise<void> {
  return httpVoid(`/qotd/${questionId}/start`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
  });
}

export async function answerQotd(
  jwt: string,
  questionId: number,
  selectedIndex: number,
): Promise<QotdAnswerResult> {
  return http<QotdAnswerResult>(`/qotd/${questionId}/answer`, {
    method: "POST",
    headers: authJson(jwt),
    body: JSON.stringify({ selected_index: selectedIndex }),
  });
}

export async function fetchQotdBoard(
  jwt: string,
  scope: QotdScope = "friends",
  leagueId?: number | null,
  track?: string,
): Promise<QotdBoard> {
  const search = new URLSearchParams(scopeQuery(scope, leagueId));
  if (track) search.set("track", track);
  return http<QotdBoard>(`/qotd/board?${search.toString()}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
}

export async function fetchQotdLeaderboard(
  jwt: string,
  scope: QotdScope = "friends",
  leagueId?: number | null,
  range?: { startDate?: string; endDate?: string },
  /** Omit to combine every track. */
  track?: string | null,
): Promise<QotdLeaderboard> {
  const search = new URLSearchParams(scopeQuery(scope, leagueId));
  if (range?.startDate) search.set("start_date", range.startDate);
  if (range?.endDate) search.set("end_date", range.endDate);
  if (track) search.set("track", track);
  return http<QotdLeaderboard>(`/qotd/leaderboard?${search.toString()}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
}

export async function fetchQotdStats(jwt: string): Promise<QotdStats> {
  return http<QotdStats>("/qotd/stats", { headers: { Authorization: `Bearer ${jwt}` } });
}

export async function submitQotdQuestion(
  jwt: string,
  payload: QotdSubmitInput,
): Promise<QotdSubmissionResult> {
  return http<QotdSubmissionResult>("/qotd/questions", {
    method: "POST",
    headers: authJson(jwt),
    body: JSON.stringify(payload),
  });
}

export async function fetchMySubmissions(jwt: string): Promise<QotdSubmission[]> {
  return http<QotdSubmission[]>("/qotd/questions/mine", {
    headers: { Authorization: `Bearer ${jwt}` },
  });
}

// Admin

export async function fetchQotdAdminQuestions(
  jwt: string,
  status?: string,
  track?: string,
): Promise<QotdAdminQuestion[]> {
  const search = new URLSearchParams();
  if (status) search.set("status", status);
  if (track) search.set("track", track);
  const qs = search.toString();
  return http<QotdAdminQuestion[]>(`/qotd/admin/questions${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
}

export async function reviewQotdQuestion(
  jwt: string,
  questionId: number,
  approve: boolean,
  notes?: string,
): Promise<QotdAdminQuestion> {
  return http<QotdAdminQuestion>(`/qotd/admin/questions/${questionId}/review`, {
    method: "POST",
    headers: authJson(jwt),
    body: JSON.stringify({ approve, notes: notes || null }),
  });
}

export async function reverifyQotdQuestion(
  jwt: string,
  questionId: number,
): Promise<QotdAdminQuestion> {
  return http<QotdAdminQuestion>(`/qotd/admin/questions/${questionId}/reverify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
  });
}

export async function scheduleQotdQuestion(
  jwt: string,
  questionId: number,
  questionDate: string,
): Promise<QotdAdminQuestion> {
  return http<QotdAdminQuestion>(`/qotd/admin/questions/${questionId}/schedule`, {
    method: "POST",
    headers: authJson(jwt),
    body: JSON.stringify({ question_date: questionDate }),
  });
}

export async function unscheduleQotdQuestion(
  jwt: string,
  questionId: number,
): Promise<QotdAdminQuestion> {
  return http<QotdAdminQuestion>(`/qotd/admin/questions/${questionId}/unschedule`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
  });
}

export async function deleteQotdQuestion(jwt: string, questionId: number): Promise<void> {
  return httpVoid(`/qotd/admin/questions/${questionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${jwt}` },
  });
}

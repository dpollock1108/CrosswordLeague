import { FormEvent, useEffect, useRef, useState } from "react";
import {
  createPlayer,
  fetchPlayers,
  fetchResultsByDate,
  importResultsCsv,
  parseScreenshot,
  submitResults,
  submitSingleResult,
  updatePlayer,
} from "../api";
import type { Player, PuzzleResultInput, ScreenshotParseResponse } from "../types";

export default function NytTracker() {
  const [token, setToken] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [payloadText, setPayloadText] = useState("");
  const [statusBulk, setStatusBulk] = useState<string | null>(null);
  const [errorBulk, setErrorBulk] = useState<string | null>(null);
  const [createPlayerStatus, setCreatePlayerStatus] = useState<string | null>(null);
  const [createPlayerError, setCreatePlayerError] = useState<string | null>(null);
  const [resultStatus, setResultStatus] = useState<string | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const [playerForm, setPlayerForm] = useState({ name: "", handle: "", email: "", nyt_username: "" });
  const [resultForm, setResultForm] = useState({
    player_id: "",
    puzzle_date: "",
    seconds: "",
    note: "",
  });
  const [gridDate, setGridDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [gridTimes, setGridTimes] = useState<Record<number, string>>({});
  const [gridLoadError, setGridLoadError] = useState<string | null>(null);
  const [csvText, setCsvText] = useState("");
  const [csvStatus, setCsvStatus] = useState<string | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [screenshotDate, setScreenshotDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState<ScreenshotParseResponse | null>(null);
  const [screenshotStatus, setScreenshotStatus] = useState<string | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPlayers()
      .then((data) => {
        setPlayers(data);
        setGridTimes(
          data.reduce((acc, p) => {
            acc[p.id] = "";
            return acc;
          }, {} as Record<number, string>),
        );
      })
      .catch((err) => setPlayersError(err.message));
  }, []);

  useEffect(() => {
    if (!token || !players.length || !gridDate) return;
    setGridLoadError(null);
    fetchResultsByDate(token, gridDate)
      .then((results) => {
        const base = players.reduce((acc, p) => {
          acc[p.id] = "";
          return acc;
        }, {} as Record<number, string>);
        for (const result of results) {
          base[result.player_id] = String(result.seconds);
        }
        setGridTimes(base);
      })
      .catch((err) => setGridLoadError(err.message));
  }, [token, players, gridDate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatusBulk(null);
    setErrorBulk(null);
    try {
      const parsed = parsePayload(payloadText);
      await submitResults(token, parsed);
      setStatusBulk(`Uploaded ${parsed.length} rows`);
      setPayloadText("");
    } catch (err) {
      setErrorBulk((err as Error).message);
    }
  }

  async function handleCreatePlayer(e: FormEvent) {
    e.preventDefault();
    setCreatePlayerStatus(null);
    setCreatePlayerError(null);
    try {
      if (editingPlayer) {
        const player = await updatePlayer(token, editingPlayer.id, {
          name: playerForm.name.trim(),
          handle: playerForm.handle.trim() || undefined,
          email: playerForm.email.trim() || undefined,
          nyt_username: playerForm.nyt_username.trim() || undefined,
        });
        setCreatePlayerStatus(`Updated player ${player.name}`);
        setEditingPlayer(null);
      } else {
        const player = await createPlayer(token, {
          name: playerForm.name.trim(),
          handle: playerForm.handle.trim() || undefined,
          email: playerForm.email.trim() || undefined,
          nyt_username: playerForm.nyt_username.trim() || undefined,
        });
        setCreatePlayerStatus(`Created player ${player.name}`);
      }
      setPlayerForm({ name: "", handle: "", email: "", nyt_username: "" });
      const refreshed = await fetchPlayers();
      setPlayers(refreshed);
    } catch (err) {
      setCreatePlayerError((err as Error).message);
    }
  }

  async function handleCreateResult(e: FormEvent) {
    e.preventDefault();
    setResultStatus(null);
    setResultError(null);
    try {
      await submitSingleResult(token, {
        player_id: Number(resultForm.player_id),
        puzzle_date: resultForm.puzzle_date,
        seconds: Number(resultForm.seconds),
        note: resultForm.note || undefined,
      });
      setResultStatus("Result recorded");
      setResultForm({ player_id: "", puzzle_date: "", seconds: "", note: "" });
    } catch (err) {
      setResultError((err as Error).message);
    }
  }

  async function handleGridSubmit(e: FormEvent) {
    e.preventDefault();
    setResultStatus(null);
    setResultError(null);
    const entries = Object.entries(gridTimes)
      .filter(([, value]) => value.trim() !== "")
      .map(([playerId, value]) => ({
        player_id: Number(playerId),
        puzzle_date: gridDate,
        seconds: Number(value),
      }));
    if (!entries.length) {
      setResultError("Enter at least one time.");
      return;
    }
    try {
      for (const entry of entries) {
        await submitSingleResult(token, entry);
      }
      setResultStatus(`Saved ${entries.length} result(s) for ${gridDate}`);
      setGridTimes((prev) =>
        Object.fromEntries(Object.keys(prev).map((k) => [Number(k), ""])),
      );
    } catch (err) {
      setResultError((err as Error).message);
    }
  }

  async function handleCsvSubmit(e: FormEvent) {
    e.preventDefault();
    setCsvStatus(null);
    setCsvError(null);
    try {
      const rows = parseCsv(csvText);
      const summary = await importResultsCsv(token, rows, true);
      setCsvStatus(`Imported ${summary.imported} row(s); skipped ${summary.skipped}`);
      if (summary.errors && summary.errors.length) {
        setCsvError(summary.errors.join("; "));
      }
      setCsvText("");
    } catch (err) {
      setCsvError((err as Error).message);
    }
  }

  async function handleParseScreenshot(e: FormEvent) {
    e.preventDefault();
    if (!screenshotFile) return;
    setParsing(true);
    setParseResult(null);
    setScreenshotStatus(null);
    setScreenshotError(null);
    try {
      const result = await parseScreenshot(token, screenshotFile, screenshotDate);
      setParseResult(result);
    } catch (err) {
      setScreenshotError((err as Error).message);
    } finally {
      setParsing(false);
    }
  }

  async function handleConfirmImport() {
    if (!parseResult) return;
    setImporting(true);
    setScreenshotStatus(null);
    setScreenshotError(null);
    try {
      const entries: PuzzleResultInput[] = parseResult.parsed
        .filter((e) => e.matched && e.player_id !== null)
        .map((e) => ({
          player_id: e.player_id as number,
          puzzle_date: parseResult.puzzle_date,
          seconds: e.seconds,
          source: "screenshot",
        }));
      await submitResults(token, entries, true);
      setScreenshotStatus(`Imported ${entries.length} result(s) for ${parseResult.puzzle_date}`);
      setParseResult(null);
      setScreenshotFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setScreenshotError((err as Error).message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <h2>NYT Mini Tracker</h2>
          <p className="muted">Legacy tools for importing NYT Mini results (screenshot, CSV, manual entry).</p>
        </div>
        <span className="badge">Requires admin token</span>
      </div>
      <form onSubmit={handleSubmit}>
        <label>
          Admin token
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="X-Admin-Token value"
            required
          />
        </label>
        <label>
          Results (JSON array)
          <textarea
            rows={8}
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
            placeholder='[{"player_id":1,"puzzle_date":"2025-01-01","seconds":42}]'
            required
          />
        </label>
        <button type="submit" disabled={!token || !payloadText}>
          Submit
        </button>
      </form>
      <p className="muted" style={{ marginTop: 8 }}>
        Tip: To overwrite existing rows for a date/player, include the record again; the backend upserts when
        `overwrite_existing` is true (default).
      </p>
      {statusBulk && <p style={{ color: "green" }}>{statusBulk}</p>}
      {errorBulk && <p style={{ color: "crimson" }}>Error: {errorBulk}</p>}

      <hr style={{ margin: "16px 0", border: "none", borderBottom: "1px solid #e5e7eb" }} />

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <form onSubmit={handleCreatePlayer}>
          <h3>{editingPlayer ? "Edit Player" : "Create Player"}</h3>
          <label>
            Name
            <input
              type="text"
              value={playerForm.name}
              onChange={(e) => setPlayerForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </label>
          <label>
            Handle (optional)
            <input
              type="text"
              value={playerForm.handle}
              onChange={(e) => setPlayerForm((f) => ({ ...f, handle: e.target.value }))}
            />
          </label>
          <label>
            NYT username (optional)
            <input
              type="text"
              value={playerForm.nyt_username}
              onChange={(e) => setPlayerForm((f) => ({ ...f, nyt_username: e.target.value }))}
            />
          </label>
          <label>
            Email (optional)
            <input
              type="email"
              value={playerForm.email}
              onChange={(e) => setPlayerForm((f) => ({ ...f, email: e.target.value }))}
            />
          </label>
          <button type="submit" disabled={!token || !playerForm.name}>
            {editingPlayer ? "Update player" : "Create player"}
          </button>
          {editingPlayer && (
            <button
              type="button"
              onClick={() => {
                setEditingPlayer(null);
                setPlayerForm({ name: "", handle: "", email: "", nyt_username: "" });
              }}
            >
              Cancel edit
            </button>
          )}
          {createPlayerStatus && <p style={{ color: "green" }}>{createPlayerStatus}</p>}
          {createPlayerError && <p style={{ color: "crimson" }}>Error: {createPlayerError}</p>}
        </form>

        <form onSubmit={handleCreateResult}>
          <h3>Add Result (single)</h3>
          <label>
            Player
            <select
              value={resultForm.player_id}
              onChange={(e) => setResultForm((f) => ({ ...f, player_id: e.target.value }))}
              required
            >
              <option value="">Select a player</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.handle ? `(@${p.handle})` : ""}
                </option>
              ))}
            </select>
          </label>
          {playersError && <p style={{ color: "crimson" }}>{playersError}</p>}
          <label>
            Puzzle date
            <input
              type="date"
              value={resultForm.puzzle_date}
              onChange={(e) => setResultForm((f) => ({ ...f, puzzle_date: e.target.value }))}
              required
            />
          </label>
          <label>
            Seconds
            <input
              type="number"
              min="1"
              value={resultForm.seconds}
              onChange={(e) => setResultForm((f) => ({ ...f, seconds: e.target.value }))}
              required
            />
          </label>
          <label>
            Note (optional)
            <input
              type="text"
              value={resultForm.note}
              onChange={(e) => setResultForm((f) => ({ ...f, note: e.target.value }))}
            />
          </label>
          <button
            type="submit"
            disabled={!token || !resultForm.player_id || !resultForm.puzzle_date || !resultForm.seconds}
          >
            Save result
          </button>
          {resultStatus && <p style={{ color: "green" }}>{resultStatus}</p>}
          {resultError && <p style={{ color: "crimson" }}>Error: {resultError}</p>}
        </form>

        <div>
          <h3>Existing Players</h3>
          <p className="muted">Click edit to modify name/handle/email/NYT username.</p>
          <div className="grid">
            {players.map((p) => (
              <div key={p.id} className="card" style={{ margin: 0 }}>
                <strong>{p.name}</strong>
                <p className="muted" style={{ margin: "4px 0" }}>
                  {p.handle ? `@${p.handle}` : "No handle"}
                </p>
                <p className="muted" style={{ margin: "4px 0" }}>
                  NYT: {p.nyt_username || "—"}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEditingPlayer(p);
                    setPlayerForm({
                      name: p.name || "",
                      handle: p.handle || "",
                      email: p.email || "",
                      nyt_username: p.nyt_username || "",
                    });
                  }}
                  style={{ marginTop: 8 }}
                >
                  Edit
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <form onSubmit={handleGridSubmit}>
          <h3>Enter today’s times</h3>
          <label>
            Date
            <input type="date" value={gridDate} onChange={(e) => setGridDate(e.target.value)} required />
          </label>
          {gridLoadError && <p style={{ color: "crimson" }}>{gridLoadError}</p>}
          <div className="grid" style={{ marginTop: 12 }}>
            {players.map((p) => (
              <div key={p.id} className="card" style={{ margin: 0 }}>
                <p style={{ margin: 0, fontWeight: 700 }}>
                  {p.name} {p.handle ? `(@${p.handle})` : ""}
                </p>
                <label style={{ marginTop: 8 }}>
                  Seconds
                  <input
                    type="number"
                    min="1"
                    value={gridTimes[p.id] ?? ""}
                    onChange={(e) =>
                      setGridTimes((prev) => ({
                        ...prev,
                        [p.id]: e.target.value,
                      }))
                    }
                    placeholder="e.g., 52"
                  />
                </label>
              </div>
            ))}
          </div>
          <button type="submit" disabled={!token || !gridDate}>
            Save times
          </button>
          {resultStatus && <p style={{ color: "green" }}>{resultStatus}</p>}
          {resultError && <p style={{ color: "crimson" }}>Error: {resultError}</p>}
        </form>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Import from Screenshot</h3>
        <p className="muted">
          Upload a screenshot of the NYT Mini friends leaderboard. Claude will parse the times and
          match players by their NYT username (set via the player editor above).
        </p>
        <form onSubmit={handleParseScreenshot}>
          <label>
            Puzzle date
            <input
              type="date"
              value={screenshotDate}
              onChange={(e) => {
                setScreenshotDate(e.target.value);
                setParseResult(null);
              }}
              required
            />
          </label>
          <label>
            Leaderboard screenshot
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                setScreenshotFile(e.target.files?.[0] ?? null);
                setParseResult(null);
                setScreenshotStatus(null);
                setScreenshotError(null);
              }}
              required
            />
          </label>
          <button type="submit" disabled={!token || !screenshotFile || !screenshotDate || parsing}>
            {parsing ? "Parsing…" : "Parse Screenshot"}
          </button>
        </form>

        {parseResult && (
          <div style={{ marginTop: 16 }}>
            <h4 style={{ margin: "0 0 8px" }}>
              Parsed results — {parseResult.matched_count} matched, {parseResult.unmatched_count} unmatched
            </h4>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9em" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid #e5e7eb" }}>
                  <th style={{ padding: "4px 8px" }}>NYT Username</th>
                  <th style={{ padding: "4px 8px" }}>Time</th>
                  <th style={{ padding: "4px 8px" }}>Seconds</th>
                  <th style={{ padding: "4px 8px" }}>Player</th>
                  <th style={{ padding: "4px 8px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {parseResult.parsed.map((entry) => (
                  <tr
                    key={entry.nyt_username}
                    style={{ borderBottom: "1px solid #e5e7eb", color: entry.matched ? "inherit" : "crimson" }}
                  >
                    <td style={{ padding: "4px 8px" }}>{entry.nyt_username}</td>
                    <td style={{ padding: "4px 8px" }}>{entry.time_str}</td>
                    <td style={{ padding: "4px 8px" }}>{entry.seconds}</td>
                    <td style={{ padding: "4px 8px" }}>{entry.player_name ?? "—"}</td>
                    <td style={{ padding: "4px 8px" }}>{entry.matched ? "✓ matched" : "✗ no match"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parseResult.unmatched_count > 0 && (
              <p className="muted" style={{ marginTop: 8 }}>
                Unmatched players need their NYT username filled in via the player editor above.
              </p>
            )}
            {parseResult.matched_count > 0 && (
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={importing}
                style={{ marginTop: 12 }}
              >
                {importing ? "Importing…" : `Import ${parseResult.matched_count} matched result(s)`}
              </button>
            )}
          </div>
        )}

        {screenshotStatus && <p style={{ color: "green", marginTop: 8 }}>{screenshotStatus}</p>}
        {screenshotError && <p style={{ color: "crimson", marginTop: 8 }}>Error: {screenshotError}</p>}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <form onSubmit={handleCsvSubmit}>
          <h3>CSV import</h3>
          <p className="muted">
            Columns: player_id,puzzle_date,seconds,points_override,note,source. One row per result.
          </p>
          <textarea
            rows={6}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="player_id,puzzle_date,seconds,points_override,note,source\n1,2025-01-01,42,,,"
            required
          />
          <button type="submit" disabled={!token || !csvText}>
            Import CSV
          </button>
          {csvStatus && <p style={{ color: "green" }}>{csvStatus}</p>}
          {csvError && <p style={{ color: "crimson" }}>{csvError}</p>}
        </form>
      </div>
    </section>
  );
}

function parsePayload(raw: string): PuzzleResultInput[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error("Payload must be valid JSON");
  }
  if (!Array.isArray(data)) {
    throw new Error("Payload must be an array of results");
  }
  return data as PuzzleResultInput[];
}

function parseCsv(raw: string) {
  const lines = raw
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (!lines.length) {
    throw new Error("CSV cannot be empty");
  }
  const headers = lines[0].split(",").map((h) => h.trim());
  const required = ["player_id", "puzzle_date", "seconds"];
  for (const req of required) {
    if (!headers.includes(req)) throw new Error(`Missing required column: ${req}`);
  }
  const rows = lines.slice(1).map((line, idx) => {
    const cols = line.split(",").map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return {
      player_id: Number(row["player_id"]),
      puzzle_date: row["puzzle_date"],
      seconds: Number(row["seconds"]),
      points_override: row["points_override"] ? Number(row["points_override"]) : undefined,
      note: row["note"] || undefined,
      source: row["source"] || "csv",
      __line: idx + 2,
    };
  });
  const bad = rows.find((r) => !r.player_id || !r.puzzle_date || !r.seconds);
  if (bad) {
    throw new Error(`Invalid row near line ${bad.__line}`);
  }
  return rows.map(({ __line, ...rest }) => rest);
}

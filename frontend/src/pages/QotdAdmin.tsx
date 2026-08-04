import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  deleteQotdQuestion,
  fetchQotdAdminQuestions,
  reverifyQotdQuestion,
  reviewQotdQuestion,
  scheduleQotdQuestion,
  unscheduleQotdQuestion,
} from "../api";
import type { QotdAdminQuestion } from "../types";

const CHOICE_LABELS = ["A", "B", "C", "D"];

const FILTERS: Array<{ value: string; label: string }> = [
  { value: "needs_review", label: "Review queue" },
  { value: "approved", label: "Bank" },
  { value: "scheduled", label: "Scheduled" },
  { value: "rejected", label: "Rejected" },
  { value: "", label: "All" },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const secondaryButton = {
  background: "#e5e7eb",
  color: "#374151",
  padding: "6px 12px",
  fontSize: 13,
} as const;

export default function QotdAdmin() {
  const { token, user } = useAuth();
  const [filter, setFilter] = useState<string>("needs_review");
  const [questions, setQuestions] = useState<QotdAdminQuestion[]>([]);
  const [dates, setDates] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setQuestions(await fetchQotdAdminQuestions(token, filter || undefined));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load questions");
    }
  }, [token, filter]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  if (!user?.is_admin) return <p className="muted">Admins only.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ marginBottom: 4 }}>QOTD questions</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Player submissions are auto-verified by AI. Anything it wasn't confident about waits here.
          Verified questions are auto-promoted from the bank when a day has nothing scheduled.
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            style={
              filter === f.value
                ? { padding: "6px 12px", fontSize: 13 }
                : { ...secondaryButton }
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {notice && (
        <div style={{ padding: 12, borderRadius: 8, background: "#f0fdf4", color: "#166534", fontSize: 14 }}>
          {notice}
        </div>
      )}
      {error && (
        <div style={{ padding: 12, borderRadius: 8, background: "#fef2f2", color: "#991b1b", fontSize: 14 }}>
          {error}
        </div>
      )}

      {questions.length === 0 ? (
        <p className="muted">Nothing here.</p>
      ) : (
        questions.map((q) => (
          <div key={q.id} className="card" style={{ marginBottom: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <strong style={{ flex: "1 1 320px", fontSize: 16 }}>{q.prompt}</strong>
              <span className="muted" style={{ fontSize: 13 }}>
                #{q.id} · {q.submitted_by_handle ? `@${q.submitted_by_handle}` : "seed"} · {q.status}
              </span>
            </div>

            <ul style={{ margin: "10px 0", paddingLeft: 18 }}>
              {q.choices.map((choice, i) => (
                <li
                  key={i}
                  style={{
                    fontWeight: i === q.answer_index ? 700 : 400,
                    color: i === q.answer_index ? "#166534" : undefined,
                  }}
                >
                  {CHOICE_LABELS[i]}. {choice}
                  {i === q.answer_index ? " ✓" : ""}
                </li>
              ))}
            </ul>

            {q.explanation && (
              <p className="muted" style={{ margin: "0 0 8px", fontSize: 13 }}>
                {q.explanation}
              </p>
            )}
            {q.source_url && (
              <p style={{ margin: "0 0 8px", fontSize: 13 }}>
                <a href={q.source_url} target="_blank" rel="noreferrer">
                  Source
                </a>
              </p>
            )}
            {q.verification.notes && (
              <p
                style={{
                  margin: "0 0 10px",
                  padding: 10,
                  borderRadius: 8,
                  background: "#f9fafb",
                  fontSize: 13,
                }}
              >
                <strong>Fact-checker</strong>
                {q.verification.confidence != null ? ` (${q.verification.confidence}%)` : ""}:{" "}
                {q.verification.notes}
              </p>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {q.status !== "approved" && q.status !== "scheduled" && (
                <button
                  disabled={busy}
                  style={{ padding: "6px 12px", fontSize: 13 }}
                  onClick={() => run(() => reviewQotdQuestion(token!, q.id, true), "Approved.")}
                >
                  Approve
                </button>
              )}
              {q.status !== "rejected" && q.status !== "scheduled" && (
                <button
                  disabled={busy}
                  style={secondaryButton}
                  onClick={() => run(() => reviewQotdQuestion(token!, q.id, false), "Rejected.")}
                >
                  Reject
                </button>
              )}
              {q.status !== "scheduled" && (
                <button
                  disabled={busy}
                  style={secondaryButton}
                  onClick={() => run(() => reverifyQotdQuestion(token!, q.id), "Re-verified.")}
                >
                  Re-run fact-check
                </button>
              )}

              {q.status === "approved" && (
                <>
                  <input
                    type="date"
                    value={dates[q.id] ?? todayIso()}
                    min={todayIso()}
                    onChange={(e) => setDates({ ...dates, [q.id]: e.target.value })}
                    style={{ padding: "6px 10px", fontSize: 13 }}
                  />
                  <button
                    disabled={busy}
                    style={{ padding: "6px 12px", fontSize: 13 }}
                    onClick={() =>
                      run(
                        () => scheduleQotdQuestion(token!, q.id, dates[q.id] ?? todayIso()),
                        "Scheduled.",
                      )
                    }
                  >
                    Schedule
                  </button>
                </>
              )}
              {q.status === "scheduled" && (
                <>
                  <span className="badge">Live on {q.question_date}</span>
                  <button
                    disabled={busy}
                    style={secondaryButton}
                    onClick={() => run(() => unscheduleQotdQuestion(token!, q.id), "Back in the bank.")}
                  >
                    Unschedule
                  </button>
                </>
              )}
              {q.status !== "scheduled" && (
                <button
                  disabled={busy}
                  style={{ ...secondaryButton, marginLeft: "auto", color: "#991b1b" }}
                  onClick={() => run(() => deleteQotdQuestion(token!, q.id), "Deleted.")}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

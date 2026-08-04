import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { fetchMySubmissions, submitQotdQuestion } from "../api";
import type { QotdSubmission } from "../types";

const CHOICE_LABELS = ["A", "B", "C", "D"];
const EMPTY_CHOICES = ["", "", "", ""];

const STATUS_STYLES: Record<string, { label: string; background: string; color: string }> = {
  approved: { label: "In the bank", background: "#f0fdf4", color: "#166534" },
  scheduled: { label: "Scheduled", background: "#eef2ff", color: "#3730a3" },
  needs_review: { label: "Awaiting human review", background: "#fffbeb", color: "#92400e" },
  rejected: { label: "Not accepted", background: "#fef2f2", color: "#991b1b" },
  pending: { label: "Checking…", background: "#f3f4f6", color: "#374151" },
};

function StatusPill({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  return (
    <span
      className="chip"
      style={{ background: style.background, color: style.color, fontSize: 12 }}
    >
      {style.label}
    </span>
  );
}

export default function QotdSubmit() {
  const { token, user } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [choices, setChoices] = useState<string[]>(EMPTY_CHOICES);
  const [answerIndex, setAnswerIndex] = useState(0);
  const [explanation, setExplanation] = useState("");
  const [category, setCategory] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  const [submissions, setSubmissions] = useState<QotdSubmission[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setSubmissions(await fetchMySubmissions(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load your submissions");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const trimmed = choices.map((c) => c.trim());
  const canSubmit =
    prompt.trim().length >= 10 &&
    trimmed.every(Boolean) &&
    new Set(trimmed.map((c) => c.toLowerCase())).size === trimmed.length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !canSubmit) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await submitQotdQuestion(token, {
        prompt: prompt.trim(),
        choices: trimmed,
        answer_index: answerIndex,
        explanation: explanation.trim() || null,
        category: category.trim() || null,
        source_url: sourceUrl.trim() || null,
      });
      setNotice(res.message);
      setPrompt("");
      setChoices(EMPTY_CHOICES);
      setAnswerIndex(0);
      setExplanation("");
      setCategory("");
      setSourceUrl("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit your question");
    } finally {
      setBusy(false);
    }
  };

  if (!user) return <p className="muted">Sign in to submit questions.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ marginBottom: 4 }}>Submit a question</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Every question in the game comes from a player. Yours is fact-checked by AI before it can
          go live — it has to confirm your answer is right and that no other choice also works.
        </p>
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

      <form className="card" onSubmit={handleSubmit} style={{ gap: 16 }}>
        <label>
          Question
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Which planet in our solar system has the shortest day?"
            rows={2}
            maxLength={400}
          />
          <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>
            Keep it answerable by a well-read non-specialist, and make sure the answer won't change
            next year — "current champion" style questions get rejected.
          </span>
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontWeight: 600 }}>Choices — select the correct one</span>
          {choices.map((choice, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="radio"
                name="answer"
                checked={answerIndex === i}
                onChange={() => setAnswerIndex(i)}
                style={{ width: 18, height: 18, flexShrink: 0 }}
                aria-label={`Mark choice ${CHOICE_LABELS[i]} correct`}
              />
              <span className="muted" style={{ width: 16, fontWeight: 700 }}>
                {CHOICE_LABELS[i]}
              </span>
              <input
                style={{ flex: 1 }}
                value={choice}
                onChange={(e) => {
                  const next = [...choices];
                  next[i] = e.target.value;
                  setChoices(next);
                }}
                placeholder={i === 0 ? "The correct answer" : "A plausible wrong answer"}
                maxLength={120}
              />
            </div>
          ))}
        </div>

        <label>
          Why is that the answer? <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder="Jupiter rotates once about every 10 hours."
            rows={2}
            maxLength={600}
          />
          <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>
            Shown to everyone after they answer. It also helps the fact-checker agree with you.
          </span>
        </label>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label style={{ flex: "1 1 160px" }}>
            Category <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Science" maxLength={40} />
          </label>
          <label style={{ flex: "1 1 220px" }}>
            Source link <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
            <input
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://…"
              maxLength={500}
            />
          </label>
        </div>

        <div>
          <button disabled={busy || !canSubmit}>{busy ? "Fact-checking…" : "Submit for verification"}</button>
          {!canSubmit && (prompt || trimmed.some(Boolean)) && (
            <span className="muted" style={{ marginLeft: 12, fontSize: 13 }}>
              Needs a question of at least 10 characters and four distinct choices.
            </span>
          )}
        </div>
      </form>

      <div>
        <h3 style={{ marginBottom: 8 }}>Your submissions</h3>
        {submissions.length === 0 ? (
          <p className="muted">Nothing submitted yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {submissions.map((s) => (
              <div key={s.id} className="card" style={{ marginBottom: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <strong style={{ flex: "1 1 300px" }}>{s.prompt}</strong>
                  <StatusPill status={s.status} />
                </div>
                <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
                  Answer: {CHOICE_LABELS[s.answer_index]} — {s.choices[s.answer_index]}
                  {s.question_date ? ` · live on ${s.question_date}` : ""}
                </p>
                {s.verification.notes && (
                  <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
                    Fact-checker
                    {s.verification.confidence != null ? ` (${s.verification.confidence}% confident)` : ""}:{" "}
                    {s.verification.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

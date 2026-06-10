import { useCallback, useEffect, useState } from "react";
import { fetchLeagueScoringConfig, updateLeagueScoringConfig } from "../api";
import type { CategoryScoring, LeagueScoringConfig } from "../types";

type Category = "mini" | "medium";

// Editable form rows use strings so inputs can be empty mid-edit.
type TierRow = { maxSeconds: string; points: string };
type FormCategory = { tiers: TierRow[]; bonus: string };
type Form = Record<Category, FormCategory>;

function toForm(cfg: LeagueScoringConfig): Form {
  const cat = (c: CategoryScoring): FormCategory => ({
    tiers: c.tiers.map((t) => ({
      maxSeconds: t.max_seconds == null ? "" : String(t.max_seconds),
      points: String(t.points),
    })),
    bonus: String(c.bonus),
  });
  return { mini: cat(cfg.mini), medium: cat(cfg.medium) };
}

function fromForm(form: Form): LeagueScoringConfig {
  const cat = (c: FormCategory): CategoryScoring => ({
    tiers: c.tiers.map((t) => ({
      max_seconds: t.maxSeconds.trim() === "" ? null : Number(t.maxSeconds),
      points: Number(t.points || 0),
    })),
    bonus: Number(c.bonus || 0),
  });
  return { mini: cat(form.mini), medium: cat(form.medium) };
}

const inputStyle = {
  padding: "4px 8px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  fontSize: 13,
  width: 90,
} as const;

export default function ScoringConfigEditor({ leagueId, token }: { leagueId: number; token: string }) {
  const [form, setForm] = useState<Form | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setForm(toForm(await fetchLeagueScoringConfig(token, leagueId)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load scoring");
    }
  }, [token, leagueId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!form) return <p className="muted">Loading scoring…</p>;

  const updateCat = (cat: Category, next: FormCategory) =>
    setForm((f) => (f ? { ...f, [cat]: next } : f));

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      const saved = await updateLeagueScoringConfig(token, leagueId, fromForm(form));
      setForm(toForm(saved));
      setStatus("Scoring saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save scoring");
    } finally {
      setSaving(false);
    }
  };

  const renderCategory = (cat: Category, label: string) => {
    const c = form[cat];
    return (
      <div style={{ flex: "1 1 280px", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
        <h4 style={{ margin: "0 0 8px" }}>{label}</h4>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#6b7280" }}>
              <th style={{ fontWeight: 600, paddingBottom: 4 }}>Finish ≤ (sec)</th>
              <th style={{ fontWeight: 600, paddingBottom: 4 }}>Points</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {c.tiers.map((t, i) => (
              <tr key={i}>
                <td style={{ paddingBottom: 4 }}>
                  <input
                    style={inputStyle}
                    type="number"
                    min={1}
                    placeholder="(slower)"
                    value={t.maxSeconds}
                    onChange={(e) => {
                      const tiers = [...c.tiers];
                      tiers[i] = { ...tiers[i], maxSeconds: e.target.value };
                      updateCat(cat, { ...c, tiers });
                    }}
                  />
                </td>
                <td style={{ paddingBottom: 4 }}>
                  <input
                    style={inputStyle}
                    type="number"
                    min={0}
                    value={t.points}
                    onChange={(e) => {
                      const tiers = [...c.tiers];
                      tiers[i] = { ...tiers[i], points: e.target.value };
                      updateCat(cat, { ...c, tiers });
                    }}
                  />
                </td>
                <td style={{ paddingBottom: 4 }}>
                  <button
                    type="button"
                    onClick={() => updateCat(cat, { ...c, tiers: c.tiers.filter((_, j) => j !== i) })}
                    style={{ padding: "2px 8px", borderRadius: 6, border: "1px solid #d1d5db", background: "white", color: "#991b1b", fontSize: 12, cursor: "pointer" }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          onClick={() => updateCat(cat, { ...c, tiers: [...c.tiers, { maxSeconds: "", points: "1" }] })}
          style={{ marginTop: 6, padding: "4px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "white", color: "#0f172a", fontSize: 12, cursor: "pointer" }}
        >
          + Add tier
        </button>
        <label style={{ display: "block", marginTop: 10, fontSize: 13, fontWeight: 600 }}>
          First-place bonus
          <input
            style={{ ...inputStyle, display: "block", marginTop: 4 }}
            type="number"
            min={0}
            value={c.bonus}
            onChange={(e) => updateCat(cat, { ...c, bonus: e.target.value })}
          />
        </label>
      </div>
    );
  };

  return (
    <div>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Set the time-to-points tiers and the daily first-place bonus for each puzzle size. Leave a tier's
        time blank to make it the catch-all (anyone slower). Tiers apply within your league only.
      </p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {renderCategory("mini", "Mini (5×5)")}
        {renderCategory("medium", "Medium (10×10)")}
      </div>
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#2563eb", color: "white", fontWeight: 600, cursor: "pointer" }}
        >
          {saving ? "Saving…" : "Save scoring"}
        </button>
        {status && <span style={{ color: "#166534", fontSize: 13 }}>{status}</span>}
        {error && <span style={{ color: "#991b1b", fontSize: 13 }}>{error}</span>}
      </div>
    </div>
  );
}

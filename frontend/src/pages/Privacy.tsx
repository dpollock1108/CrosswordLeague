import { Link } from "react-router-dom";

// Two things to set before this is real:
//  - CONTACT_EMAIL must be an address you actually read. A policy with no
//    working contact is worse than no policy.
//  - Bump LAST_UPDATED whenever the text below changes.
const CONTACT_EMAIL = "crosswordleaguesupport@gmail.com";
const LAST_UPDATED = "17 August 2026";

const h2 = { fontSize: 20, margin: "32px 0 8px" } as const;
const p = { margin: "0 0 12px", color: "var(--text-secondary)", lineHeight: 1.6 } as const;
const li = { marginBottom: 6, color: "var(--text-secondary)", lineHeight: 1.6 } as const;

export default function Privacy() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--surface-subtle)" }}>
      <header style={{ maxWidth: 780, margin: "0 auto", padding: "24px 24px 0" }}>
        <Link to="/" style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none", fontSize: 14 }}>
          ← Crossword League
        </Link>
      </header>

      <main style={{ maxWidth: 780, margin: "0 auto", padding: "24px 24px 72px" }}>
        <h1 style={{ fontSize: 36, margin: "0 0 6px" }}>Privacy Policy</h1>
        <p className="muted" style={{ margin: "0 0 28px" }}>Last updated {LAST_UPDATED}</p>

        <p style={p}>
          Crossword League is a small daily crossword site where friends compete in private leagues.
          This policy explains what we collect, why, and who else sees it. If anything here is
          unclear, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>

        <h2 style={h2}>What we collect</h2>
        <p style={p}>When you sign in with Google, Google sends us:</p>
        <ul>
          <li style={li}>Your email address</li>
          <li style={li}>Your display name</li>
          <li style={li}>Your profile picture URL</li>
          <li style={li}>A Google account identifier, used to recognise you on return visits</li>
        </ul>
        <p style={p}>
          We never see or receive your Google password. As you use the site we also store the handle
          you pick, the leagues you belong to, your puzzle solve times, the letters you've entered in
          a puzzle you haven't finished (so you can resume), and the times you signed up and last
          signed in.
        </p>

        <h2 style={h2}>How we use it</h2>
        <p style={p}>
          To sign you in, show your handle and avatar to other members of your leagues, record solve
          times, build leaderboards, and let you pick up an unfinished puzzle where you left off.
          We do not sell your data, we do not run advertising, and we do not use it to build a
          profile of you outside this site.
        </p>

        <h2 style={h2}>Who else sees it</h2>
        <ul>
          <li style={li}>
            <strong>Other players.</strong> Your handle, avatar, and solve times are visible to
            members of leagues you join. That is the point of a league.
          </li>
          <li style={li}>
            <strong>Google.</strong> Handles sign-in. Google also hosts the site (Google Cloud Run)
            and the database (Cloud SQL), both in the United States. Separately, our pages load a
            font from Google's font service, which means your browser contacts Google and reveals
            your IP address on every visit — including before you sign in.
          </li>
          <li style={li}>
            <strong>Anthropic.</strong> Puzzles and clues are generated using Anthropic's API. That
            involves no personal data. If a league administrator uploads a screenshot of a New York
            Times leaderboard to import results, that image is sent to Anthropic to be read, and
            such screenshots typically contain other people's names and times.
          </li>
        </ul>

        <h2 style={h2}>Cookies and local storage</h2>
        <p style={p}>
          We use no advertising or analytics cookies, and no third-party tracking. After you sign
          in, we keep a single sign-in token in your browser's local storage so you stay signed in.
          Signing out deletes it. Google may set its own cookies as part of the sign-in flow, under
          its own policy.
        </p>

        <h2 style={h2}>How long we keep it</h2>
        <p style={p}>
          Your account and results are kept for as long as your account exists, because removing
          past results would change historical leaderboards for everyone else in your league.
          Ask us to delete your account and we will remove it and your associated data.
        </p>

        <h2 style={h2}>Your choices</h2>
        <p style={p}>
          You can ask for a copy of your data, ask us to correct it, or ask us to delete it — email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. There is currently no self-service
          delete button, so these requests are handled by hand. You can also revoke this site's
          access to your Google account at any time from your Google account settings, though that
          alone does not delete data already stored here.
        </p>

        <h2 style={h2}>Children</h2>
        <p style={p}>
          This site is not intended for children under 13, and we do not knowingly collect their
          data. If you believe a child has signed up, email us and we will remove the account.
        </p>

        <h2 style={h2}>Changes</h2>
        <p style={p}>
          If this policy changes we will update the date at the top. Continuing to use the site
          after a change means you accept the updated policy.
        </p>

        <h2 style={h2}>Contact</h2>
        <p style={p}>
          Questions about any of this: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </main>
    </div>
  );
}

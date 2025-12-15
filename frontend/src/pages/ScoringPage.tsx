export default function ScoringPage() {
  return (
    <section className="card">
      <h2>Scoring Methodology</h2>
      <p className="muted">How points are awarded for each NYT Mini.</p>
      <ol>
        <li>Finish at all: 1 point.</li>
        <li>Finish under 120 seconds: 2 points.</li>
        <li>Finish under 90 seconds: 3 points.</li>
        <li>Finish under 60 seconds: 4 points.</li>
        <li>Finish at or under 30 seconds: 5 points.</li>
        <li>Bonus: +1 for first place; ties for first all get the bonus.</li>
        <li>`points_override` (admin) replaces the calculated value.</li>
      </ol>
      <p>
        Leaderboards sum these points across the selected date range and also compute average/best times for tie
        ordering. Player profiles show total points, averages, best time, and best weekday performance.
      </p>
    </section>
  );
}

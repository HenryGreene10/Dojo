import Link from "next/link";
import { DojoMark } from "@/components/dojo-mark";

export default function HomePage() {
  return (
    <main className="container">
      <header className="site-header">
        <DojoMark />
        <Link className="small-btn" href="/host">Host a game</Link>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow"><span>🀄</span> From group chat to game table</div>
          <h1>Mah Jong plans, minus the signup sheet.</h1>
          <p className="hero-copy">
            Create a game, text one link to the group, and let everyone take a seat. No guest accounts, no ads, no clutter.
          </p>
          <div className="actions">
            <Link href="/host" className="btn btn-primary">Host a game <span aria-hidden="true">→</span></Link>
            <Link href="/g/demo" className="btn btn-secondary">Try the demo</Link>
          </div>
        </div>

        <div className="hero-card" aria-label="Example Mah Jong invitation">
          <div className="demo-invite">
            <div className="demo-top">
              <div>
                <div className="eyebrow">Friday · 1:00 PM</div>
                <h3>Mah Jong at Susan&apos;s</h3>
                <div className="muted">The Thursday Dojo</div>
              </div>
              <span className="seat-pill">6 of 8 seats</span>
            </div>
            <div className="mini-tables">
              <div className="mini-table">
                <strong>Table 1</strong>
                <div className="mini-seats">
                  {['Susan','Joan','Nancy','Carol'].map((name) => <span className="mini-seat" key={name}>{name}</span>)}
                </div>
              </div>
              <div className="mini-table">
                <strong>Table 2</strong>
                <div className="mini-seats">
                  <span className="mini-seat">Linda</span><span className="mini-seat">Barbara</span>
                  <span className="mini-seat empty">Open</span><span className="mini-seat empty">Open</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

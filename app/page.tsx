import { GrantChat } from "@/components/grant-chat";
import { calls } from "@/lib/corpus";

export default function Home() {
  const programmes = new Set(calls.map((call) => call.programme)).size;

  return (
    <main className="shell">
      <header className="masthead">
        <a className="wordmark" href="#top" aria-label="Grant Scout home">
          <span className="wordmark-mark" aria-hidden="true">GS</span>
          <span>grant—scout</span>
        </a>
        <div className="status-line">
          <span className="status-dot" aria-hidden="true" />
          Illustrative snapshot · 29 Aug 2026
        </div>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">EU funding, with receipts</div>
        <h1>Ask the calls.<br /><em>See the evidence.</em></h1>
        <p className="hero-copy">
          A deliberately small agent that searches a curated funding corpus, checks eligibility with deterministic rules, and refuses uncited funding facts.
        </p>
        <div className="hero-metrics" aria-label="Demo facts">
          <div><strong>{calls.length}</strong><span>curated opportunities</span></div>
          <div><strong>{programmes}</strong><span>EU programmes</span></div>
          <div><strong>2</strong><span>auditable tools</span></div>
        </div>
      </section>

      <section className="workspace" aria-label="Grant Scout workspace">
        <GrantChat />
        <aside className="briefing">
          <div className="briefing-section">
            <p className="section-kicker">How it works</p>
            <ol className="process-list">
              <li><span>01</span><div><strong>Retrieve</strong><p>Embed the question and rank the committed corpus in memory.</p></div></li>
              <li><span>02</span><div><strong>Check</strong><p>Run deterministic geography, applicant, and consortium rules.</p></div></li>
              <li><span>03</span><div><strong>Answer</strong><p>Claude synthesises only from retrieved records and cites their IDs.</p></div></li>
            </ol>
          </div>
          <div className="briefing-section guardrail-card">
            <p className="section-kicker">Evidence contract</p>
            <p>No retrieved source, no funding claim. “No matching call” is a valid answer.</p>
            <div className="tech-row"><span>Agent</span><strong>Claude Haiku 4.5</strong></div>
            <div className="tech-row"><span>Retrieval</span><strong>text-embedding-3-small</strong></div>
            <div className="tech-row"><span>Storage</span><strong>Committed JSON</strong></div>
          </div>
          <p className="disclaimer">
            Portfolio demo, not funding advice. Programme data is an illustrative snapshot; always verify the linked official source before acting.
          </p>
        </aside>
      </section>

      <footer>
        <span>A standalone demo informed by the earlier EuFund case study.</span>
        <a href="https://github.com/Bogdan0708" target="_blank" rel="noreferrer">Source ↗</a>
      </footer>
    </main>
  );
}

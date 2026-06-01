import { useEffect } from "react";
import "@/styles/mojomap-landing.css";

const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap";

function useGoogleFonts() {
  useEffect(() => {
    if (document.querySelector(`link[data-mml-fonts]`)) return;

    const preconnect1 = document.createElement("link");
    preconnect1.rel = "preconnect";
    preconnect1.href = "https://fonts.googleapis.com";
    preconnect1.setAttribute("data-mml-fonts", "true");

    const preconnect2 = document.createElement("link");
    preconnect2.rel = "preconnect";
    preconnect2.href = "https://fonts.gstatic.com";
    preconnect2.crossOrigin = "";
    preconnect2.setAttribute("data-mml-fonts", "true");

    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = GOOGLE_FONTS_HREF;
    stylesheet.setAttribute("data-mml-fonts", "true");

    document.head.appendChild(preconnect1);
    document.head.appendChild(preconnect2);
    document.head.appendChild(stylesheet);
  }, []);
}

function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

export default function MojoMapLanding() {
  useGoogleFonts();
  useDocumentTitle("MojoMap — Clarity for consequential strategic decisions");

  return (
    <div className="mml-root">
      <header className="site-header">
        <div className="brand">
          <b>MOJOMAP</b>
        </div>
        <nav className="nav">
          <a>The problem</a>
          <a>What we do</a>
          <a>How it works</a>
          <a>The Map</a>
          <a className="apply">Apply</a>
        </nav>
      </header>

      <section className="hero" data-screen-label="01 Hero">
        <div className="hero-stamp">
          <span>
            SESSION <b>A‑0247</b>
          </span>
          <span>
            STATUS <b>OPEN INTAKE</b>
          </span>
          <span>
            CYCLE <b>Q2 · 2026</b>
          </span>
        </div>

        <div className="hero-grid">
          <aside className="hero-side">
            <div className="cap">Strategic clarity</div>
            <div className="rule"></div>
            <div className="meta">
              <div>
                <div className="k">For</div>
                <div className="v">Leadership teams</div>
              </div>
              <div>
                <div className="k">When</div>
                <div className="v">The decision is consequential</div>
              </div>
              <div>
                <div className="k">Outcome</div>
                <div className="v">Move with conviction</div>
              </div>
            </div>
          </aside>

          <div className="hero-main">
            <h1>
              Clarity for the decisions that <em className="hl">actually matter</em>.
            </h1>
            <p className="dek">
              Most leadership teams are making high‑consequence decisions on fragmented signals, weak customer
              proof, and quiet internal disagreement. We help your team see clearly enough to move with confidence.
            </p>
            <div className="ctas">
              <a className="btn btn-primary">
                Apply for a Map <span className="glyph">→</span>
              </a>
              <a className="btn btn-default">See the system</a>
              <span className="ghost">By invitation · selective intake</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section" data-screen-label="02 Problem">
        <div className="sec-head">
          <div>
            <div className="num">01 · The Problem</div>
            <h2>The signals stop agreeing.</h2>
          </div>
          <p className="lead">
            Somewhere between strategy off‑sites and the quarterly board, the picture quietly fragments. Not
            loudly. Not dramatically. Just enough that no one is sure anymore.
          </p>
        </div>

        <div className="body-wrap">
          <div className="left-spacer"></div>
          <div className="problem-list">
            <div className="row">
              <div className="n">01</div>
              <div className="stmt">
                Your dashboards show <em>activity</em>, not <em>direction</em>.
              </div>
              <div className="tag">Visibility</div>
            </div>
            <div className="row">
              <div className="n">02</div>
              <div className="stmt">
                Three senior people read the same data and arrive at three different conclusions.
              </div>
              <div className="tag">Alignment</div>
            </div>
            <div className="row">
              <div className="n">03</div>
              <div className="stmt">
                Customer proof arrives <em>after</em> you've committed the roadmap.
              </div>
              <div className="tag">Proof</div>
            </div>
            <div className="row">
              <div className="n">04</div>
              <div className="stmt">Confidence fragments quietly. No one says it; everyone feels it.</div>
              <div className="tag">Conviction</div>
            </div>
            <div className="row">
              <div className="n">05</div>
              <div className="stmt">AI is making it faster to act on assumptions you haven't tested.</div>
              <div className="tag">Drift</div>
            </div>
          </div>
        </div>
      </section>

      <section className="section alt" data-screen-label="03 What we do">
        <div className="sec-head">
          <div>
            <div className="num">02 · What we do</div>
            <h2>We make the picture clear before you commit.</h2>
          </div>
          <p className="lead">
            Not a platform. Not a framework. A small, deliberate process for leadership teams who need to see
            reality clearly enough to bet on it.
          </p>
        </div>

        <div className="body-wrap">
          <div className="left-spacer"></div>
          <div className="outcomes">
            <div className="o-row">
              <div className="o-k">We help you</div>
              <div className="o-v">
                identify <em>what matters most</em> — and stop spending attention elsewhere.
              </div>
            </div>
            <div className="o-row">
              <div className="o-k">We help you</div>
              <div className="o-v">see where your confidence is genuinely strong, and where it is borrowed.</div>
            </div>
            <div className="o-row">
              <div className="o-k">We help you</div>
              <div className="o-v">
                surface the contradictions in your team's thinking early, while they're still cheap.
              </div>
            </div>
            <div className="o-row">
              <div className="o-k">We help you</div>
              <div className="o-v">
                evaluate strategic paths <em>before</em> you commit the budget, the org, or the quarter.
              </div>
            </div>
            <div className="o-row">
              <div className="o-k">We help you</div>
              <div className="o-v">
                understand what is changing in the market that your dashboards haven't caught up to.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" data-screen-label="04 How">
        <div className="sec-head">
          <div>
            <div className="num">03 · How it works</div>
            <h2>Three movements. Roughly four weeks.</h2>
          </div>
          <p className="lead">
            We don't ship documentation. We deliver a Map — a single, sharp picture of where you actually are,
            what is pressing on the decision, and the highest‑conviction path forward.
          </p>
        </div>

        <div className="steps">
          <div className="step">
            <div className="s-num">Step 01 · Listen</div>
            <div className="s-title">We read the signals already in your business.</div>
            <div className="s-body">
              Customer interviews, internal disagreement, market motion, and the data you've stopped trusting.
              We treat all of it as evidence.
            </div>
            <div className="s-tags">
              <span>Interviews</span>
              <span>Synthesis</span>
              <span>Market read</span>
            </div>
          </div>
          <div className="step">
            <div className="s-num">Step 02 · Map</div>
            <div className="s-title">We map the pressure, the opportunity, and the drift.</div>
            <div className="s-body">
              A single picture of where you are, what's contradicting what, and where confidence is weakest.
              Nothing decorative. Everything load‑bearing.
            </div>
            <div className="s-tags">
              <span>Tensions</span>
              <span>Contradictions</span>
              <span>Confidence</span>
            </div>
          </div>
          <div className="step">
            <div className="s-num">Step 03 · Move</div>
            <div className="s-title">We help you pick the path you can actually defend.</div>
            <div className="s-body">
              A short list of strategic paths, each with its evidence, its risks, and the decision it forces.
              You leave with a move you trust.
            </div>
            <div className="s-tags">
              <span>Paths</span>
              <span>Evidence</span>
              <span>Commit</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section alt" data-screen-label="05 What changes">
        <div className="sec-head">
          <div>
            <div className="num">04 · What changes</div>
            <h2>What the room feels like after.</h2>
          </div>
          <p className="lead">
            Not a transformation. Not a new operating model. A different quality of conversation, and a different
            kind of conviction behind the next decision.
          </p>
        </div>

        <div className="body-wrap">
          <div className="left-spacer"></div>
          <div className="shift">
            <div className="col before">
              <div className="head">
                <div className="lbl">Before</div>
                <div className="arr">→</div>
              </div>
              <div className="item">Fragmented confidence</div>
              <div className="item">Reactive decisions</div>
              <div className="item">Strategy decks no one returns to</div>
              <div className="item">Customer proof, late</div>
              <div className="item">Conflicting priorities, unsaid</div>
              <div className="item">Activity mistaken for progress</div>
            </div>
            <div className="col after">
              <div className="head">
                <div className="lbl">After</div>
                <div className="arr">★</div>
              </div>
              <div className="item">
                <em>Shared clarity</em>, in one picture
              </div>
              <div className="item">Decisions grounded in evidence</div>
              <div className="item">A Map the team keeps returning to</div>
              <div className="item">
                Proof <em>before</em> you scale
              </div>
              <div className="item">Tradeoffs visible and named</div>
              <div className="item">Direction you can defend</div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" data-screen-label="06 Example">
        <div className="sec-head">
          <div>
            <div className="num">05 · A redacted Map</div>
            <h2>One decision. One picture.</h2>
          </div>
          <p className="lead">
            A simplified slice from a real Map, redacted. A consumer health company, three months before a
            defining commercial decision. One strategic center. One contradiction. A handful of signals moving in
            opposite directions.
          </p>
        </div>

        <div className="example">
          <div className="ex-head">
            <div className="cell">
              <div className="k">Client</div>
              <div className="v redacted">▆▆▆▆▆▆▆▆▆▆▆▆</div>
            </div>
            <div className="cell">
              <div className="k">Sector</div>
              <div className="v">Consumer health · DTC</div>
            </div>
            <div className="cell">
              <div className="k">Decision</div>
              <div className="v">
                <b>Channel rebalance</b> · Q3
              </div>
            </div>
            <div className="cell">
              <div className="k">Confidence (intake)</div>
              <div className="v">42 / 100</div>
            </div>
          </div>

          <div className="ex-body">
            <div className="ex-center">
              <div className="cap-row">
                <span className="cap">Strategic center</span>
                <span className="dash"></span>
                <span className="cap">01</span>
              </div>
              <div className="center-title">
                Retention is <em>fine on paper</em> — and quietly weakening on the cohorts that fund growth.
              </div>

              <div className="contradiction">
                <div className="cap">Live contradiction</div>
                <div className="lines">
                  <div className="a">Marketing reads acquisition as the bottleneck.</div>
                  <div className="b">Product reads early‑week churn as the bottleneck.</div>
                </div>
              </div>
            </div>

            <div className="ex-signals">
              <div className="s-cap">
                <span className="cap">Movement signals</span>
                <span className="meta">Last 60 days · 6 of 14 shown</span>
              </div>
              <div className="signal-list">
                <div className="sig">
                  <div className="delta">▲ +18</div>
                  <div className="desc">Acquisition cost on top‑of‑funnel keywords.</div>
                  <div className="src">Internal · ads</div>
                </div>
                <div className="sig">
                  <div className="delta minus">▼ −11</div>
                  <div className="desc">Day‑7 retention in the cohort that funds growth.</div>
                  <div className="src">Internal · BI</div>
                </div>
                <div className="sig">
                  <div className="delta minus">▼ −6</div>
                  <div className="desc">
                    "Why I cancelled" mentions of <em>habit</em>, not price.
                  </div>
                  <div className="src">Interviews · 28</div>
                </div>
                <div className="sig">
                  <div className="delta">▲ +9</div>
                  <div className="desc">Two competitors quietly cut acquisition spend.</div>
                  <div className="src redacted">▆▆▆▆▆▆▆</div>
                </div>
                <div className="sig">
                  <div className="delta">▲ +4</div>
                  <div className="desc">Category search interest, flat against forecast.</div>
                  <div className="src">Public · index</div>
                </div>
                <div className="sig">
                  <div className="delta minus">▼ −2</div>
                  <div className="desc">Internal confidence in the Q3 acquisition plan.</div>
                  <div className="src">Team · pulse</div>
                </div>
              </div>
            </div>
          </div>

          <div className="ex-foot">
            <span>
              Map · <b>M‑0182</b> · redacted
            </span>
            <span>
              Confidence (after Map) · <b>71 / 100</b>
            </span>
            <span>
              Decision · <b>commit retention‑first</b>
            </span>
          </div>
        </div>
      </section>

      <section className="section alt" data-screen-label="07 Qualification">
        <div className="sec-head">
          <div>
            <div className="num">06 · Who this is for</div>
            <h2>This is selective on purpose.</h2>
          </div>
          <p className="lead">
            We work with a small number of teams each quarter. The work only does what it claims to do when the
            decision is genuinely consequential and the team is genuinely willing to look.
          </p>
        </div>

        <div className="body-wrap">
          <div className="left-spacer"></div>
          <div className="qual">
            <div className="qcol is">
              <div className="qhead">A Map is for you when</div>
              <div className="qline">A consequential decision is approaching, and the picture is not clear.</div>
              <div className="qline">Your team is sharp, but reads the same signals differently.</div>
              <div className="qline">You suspect you're acting on assumptions you've stopped testing.</div>
              <div className="qline">Speed is now amplifying the cost of a wrong call, not lowering it.</div>
              <div className="qline">You want clarity, not a deck.</div>
            </div>
            <div className="qcol not">
              <div className="qhead">A Map is not for you when</div>
              <div className="qline">The decision is small, reversible, or already made.</div>
              <div className="qline">The team is looking for validation, not visibility.</div>
              <div className="qline">A capability gap is being mistaken for a strategy gap.</div>
              <div className="qline">You need execution support, not a clearer picture.</div>
              <div className="qline">You want a framework to show, not a choice to make.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="final" data-screen-label="08 Apply">
        <div className="final-grid">
          <aside>
            <div className="cap">07 · Apply</div>
          </aside>
          <div>
            <h2>
              If a decision feels unclear, consequential, and increasingly noisy — <em>apply for a Map</em>.
            </h2>
            <p className="sub">
              Intake is a 30‑minute conversation. We use it to understand the decision, the team, and the
              timeline. If a Map is the right instrument, we say so. If it isn't, we tell you that too.
            </p>
            <div className="ctas">
              <a className="btn btn-primary">
                Apply for a Map <span className="glyph">→</span>
              </a>
              <a className="btn btn-default">See the system</a>
            </div>
            <div className="fineprint">
              Three intakes per quarter · By invitation or referral · Q2 cycle open
            </div>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div>
          <b>MOJOMAP</b> · STRATEGIC CLARITY · EST. 2024
        </div>
        <div className="links">
          <a>Apply</a>
          <a>Contact</a>
          <a>System notes</a>
          <a>Index</a>
        </div>
      </footer>
    </div>
  );
}

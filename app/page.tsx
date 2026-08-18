import Link from "next/link";
import { ArrowRight, BrainCircuit, Database, Globe2, RefreshCcw, TrendingDown, UserRound, Zap } from "lucide-react";

const DEMO_HREF = "/demo?mode=guided";

export default function HomePage() {
  return <main className="lp">
    <nav className="lp-nav"><Link href="/" className="brand" aria-label="Hive Call home"><img src="/logo.png" alt="Hive Call" className="logo-img"/></Link><div><a href="#how">How it works</a><a href="#stack">Stack</a><Link className="nav-cta" href={DEMO_HREF}>View demo<ArrowRight size={14}/></Link></div></nav>

    <header className="lp-hero">
      <span className="hero-hex" aria-hidden="true"><i/><i/><i/><i/><i/><i/></span>
      <span className="lp-badge">Self-learning AI call center · CockroachDB × AWS</span>
      <h1>Never solve the same <span className="hl">problem twice.</span></h1>
      <p>HIVE answers known issues instantly from memory with a fast response model. New problems get full reasoning exactly once, then they&apos;re instant for every future caller.</p>
      <div className="lp-actions"><Link className="primary-button hero-cta" href={DEMO_HREF}>View demo<ArrowRight size={17}/></Link><a className="ghost-cta" href="#how">How it works</a></div>
    </header>

    <section className="ladder-wrap" id="how">
      <div className="ladder">
        <div className="tier t1">
          <span className="tier-icon"><Database size={22}/></span>
          <div className="tier-body"><div className="tier-head"><h3>Memory</h3><span className="tier-cost">$</span></div><p>Repeat issue? Vector search finds the proven fix in CockroachDB, a fast response model phrases it, and Polly speaks it. No heavy thinking, no wait.</p></div>
          <div className="tier-tags"><b>0 reasoning calls</b><b>instant</b></div>
        </div>
        <div className="tier-drop"><i aria-hidden="true"/><span>no confident match</span></div>
        <div className="tier t2">
          <span className="tier-icon"><BrainCircuit size={22}/></span>
          <div className="tier-body"><div className="tier-head"><h3>Reasoning</h3><span className="tier-cost">$$</span></div><p>Novel issue? A stronger Bedrock reasoning agent loads company context and digs through orders, policies, and tools to solve it properly.</p></div>
          <div className="tier-tags"><b>full reasoning</b><b>seconds</b></div>
        </div>
        <div className="tier-drop"><i aria-hidden="true"/><span>can&apos;t solve safely</span></div>
        <div className="tier t3">
          <span className="tier-icon"><UserRound size={22}/></span>
          <div className="tier-body"><div className="tier-head"><h3>Human</h3><span className="tier-cost">$$$</span></div><p>Edge case? A person resolves it while HIVE watches how.</p></div>
          <div className="tier-tags"><b>rare</b><b>learned once</b></div>
        </div>
        <div className="ladder-loop"><RefreshCcw size={18}/><p>Every fix is validated in the shadows, then promoted into memory. <b>The next caller starts at the top.</b></p></div>
      </div>
    </section>

    <section className="lp-values">
      <article><span className="value-icon"><TrendingDown size={22}/></span><h3>Costs collapse</h3><p>A repeat call costs a vector lookup and a fast response, not a full reasoning run. The more you resolve, the less you spend.</p></article>
      <article><span className="value-icon"><Zap size={22}/></span><h3>Instant answers</h3><p>Known problems skip the heavy thinking. They are matched in memory and answered on the spot.</p></article>
      <article><span className="value-icon"><Globe2 size={22}/></span><h3>Scales like a database</h3><p>Because the brain is one: distributed CockroachDB. Every agent, every region, one shared memory.</p></article>
    </section>

    <section className="lp-arch" id="under-the-hood">
      <h2>Under the hood</h2>
      <p>One call, end to end, and how every fix comes back as memory.</p>
      <div className="arch-scroll"><svg viewBox="0 0 980 560" role="img" aria-label="Architecture: a caller's issue is embedded with Amazon Titan and matched against CockroachDB memory. A confident skill match goes to the fast response model and Polly. No safe match goes to Bedrock reasoning with company context. Unsolved cases go to a human. Reasoning and human fixes flow back into CockroachDB as shadow-validated skills.">
        <defs>
          <marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#9fb1c4"/></marker>
          <marker id="ahg" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#4ea07e"/></marker>
        </defs>
        <path className="arch-line arch-flow" markerEnd="url(#ah)" d="M150,275 H247"/>
        <text className="an-label" x="200" y="260" textAnchor="middle">Titan embedding</text>
        <path className="arch-line arch-flow" markerEnd="url(#ah)" d="M480,250 C580,250 570,95 652,95"/>
        <text className="an-label g" x="566" y="170" textAnchor="middle">confident skill match</text>
        <path className="arch-line arch-flow" markerEnd="url(#ah)" d="M480,283 C550,283 590,275 652,275"/>
        <text className="an-label b" x="566" y="262" textAnchor="middle">no safe match</text>
        <path className="arch-line arch-flow" markerEnd="url(#ah)" d="M790,310 V412"/>
        <text className="an-label a" x="802" y="368" textAnchor="start">can&apos;t solve safely</text>
        <path className="arch-return" markerEnd="url(#ahg)" d="M660,472 C450,506 368,424 368,352"/>
        <path className="arch-return" d="M660,300 C595,338 520,342 484,320"/>
        <text className="an-label g" x="470" y="520" textAnchor="middle">learned → shadow-validated → promoted</text>
        <path className="arch-return" markerEnd="url(#ahg)" d="M652,80 C380,28 128,108 91,238"/>
        <text className="an-label g" x="322" y="52" textAnchor="middle">instant answer</text>
        <rect className="an-box" x="30" y="245" width="120" height="60" rx="14"/>
        <text className="an-title" x="90" y="272" textAnchor="middle">Caller</text>
        <text className="an-sub" x="90" y="291" textAnchor="middle">voice call</text>
        <rect className="an-box db" x="255" y="205" width="225" height="140" rx="16"/>
        <polygon className="an-hex" points="367,216 378,222.5 378,235.5 367,242 356,235.5 356,222.5"/>
        <text className="an-title" x="367" y="266" textAnchor="middle">CockroachDB memory</text>
        <text className="an-sub" x="367" y="290" textAnchor="middle">learned skills · VECTOR(1024)</text>
        <text className="an-sub" x="367" y="310" textAnchor="middle">company context · policies</text>
        <rect className="an-box g" x="660" y="60" width="260" height="70" rx="14"/>
        <text className="an-title" x="790" y="90" textAnchor="middle">Fast response model</text>
        <text className="an-sub" x="790" y="110" textAnchor="middle">verified facts · Polly speaks it</text>
        <rect className="an-box b" x="660" y="240" width="260" height="70" rx="14"/>
        <text className="an-title" x="790" y="270" textAnchor="middle">Bedrock reasoning</text>
        <text className="an-sub" x="790" y="290" textAnchor="middle">company context · typed tools</text>
        <rect className="an-box a" x="660" y="420" width="260" height="70" rx="14"/>
        <text className="an-title" x="790" y="450" textAnchor="middle">Human agent</text>
        <text className="an-sub" x="790" y="470" textAnchor="middle">sees the full investigation</text>
      </svg></div>
    </section>

    <section className="lp-proof"><span className="proof-wave" aria-hidden="true"><i/><i/><i/><i/><i/></span><p>In the live demo, a skill learned from a human resolution answers the next similar call with <b>zero full-reasoning calls</b>: persisted, versioned, and auditable.</p><Link href="/demo/evaluation">See the evidence<ArrowRight size={15}/></Link></section>

    <section className="lp-stack" id="stack"><span>Built on</span><div>{["CockroachDB", "VECTOR(1024)", "Managed MCP", "AWS Bedrock", "Amazon Titan", "Amazon Polly", "AWS Lambda", "S3"].map((name) => <em key={name}>{name}</em>)}</div></section>

    <section className="lp-final"><span className="hero-hex final-hex" aria-hidden="true"><i/><i/><i/></span><h2>See HIVE learn, live.</h2><p>Four calls. One new skill. Zero repeats.</p><Link className="primary-button hero-cta" href={DEMO_HREF}>View demo<ArrowRight size={17}/></Link></section>

    <footer className="lp-footer"><img src="/logo.png" alt="Hive Call" className="logo-img footer-logo"/><p>A solved call should never be solved twice.</p></footer>
  </main>;
}

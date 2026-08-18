import Link from "next/link";
import { Activity, BookOpen, PhoneCall } from "lucide-react";

export function Navigation({ active }: { active: "demo" | "skills" | "evaluation" }) {
  return <header className="topbar">
    <Link href="/" className="brand" aria-label="Hive Call home"><img src="/logo.png" alt="Hive Call" className="logo-img topbar-logo"/></Link>
    <div className="workspace"><span className="workspace-dot" />Northstar Commerce <span className="chevron">⌄</span></div>
    <nav aria-label="Product navigation">
      <Link className={active === "demo" ? "nav-link active" : "nav-link"} href="/demo"><PhoneCall size={15} />Live calls</Link>
      <Link className={active === "skills" ? "nav-link active" : "nav-link"} href="/demo/skills"><BookOpen size={15} />Skills</Link>
      <Link className={active === "evaluation" ? "nav-link active" : "nav-link"} href="/demo/evaluation"><Activity size={15} />Evaluation</Link>
    </nav>
    <div className="avatar">SA</div>
  </header>;
}

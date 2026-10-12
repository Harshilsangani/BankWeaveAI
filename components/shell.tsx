"use client";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Bell,
  BookOpen,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  FileText,
  FlaskConical,
  LayoutDashboard,
  Menu,
  Radar,
  ScanLine,
  Search,
  Settings2,
  Sparkles,
} from "lucide-react";
import type { Page } from "@/types";
import { Logo } from "./ui";
const navigation: { label: Page; icon: typeof Activity }[] = [
  { label: "Command Center", icon: LayoutDashboard },
  { label: "AI Analyst", icon: Sparkles },
  { label: "Risk Radar", icon: Radar },
  { label: "Investigations", icon: ScanLine },
  { label: "Scenario Simulator", icon: FlaskConical },
  { label: "Reports", icon: FileText },
  { label: "Knowledge", icon: BookOpen },
  { label: "Settings", icon: Settings2 },
];
export const pages: Page[] = [...navigation.map((n) => n.label), "Data Workspace"];
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
export function Shell({
  role,
  page,
  riskCount,
  onPage,
  onSearch,
  onNotifications,
  onProfile,
  mobileOpen,
  setMobileOpen,
  chatHistory,
  children,
}: {
  role?: import("@/lib/staff-role").StaffRole;
  page: Page;
  riskCount?: number;
  onPage: (page: Page) => void;
  onSearch: () => void;
  onNotifications: () => void;
  onProfile: () => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  children: React.ReactNode;
  chatHistory: React.ReactNode;
}) {
  const sidebar = useRef<HTMLElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!narrow || !mobileOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const controls = () =>
      Array.from(
        sidebar.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [tabindex="0"]'
        ) ?? []
      );
    (
      sidebar.current?.querySelector<HTMLButtonElement>('[aria-current="page"]') ?? controls()[0]
    )?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const buttons = controls();
      const first = buttons[0],
        last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", trap);
      previousFocus?.focus();
    };
  }, [narrow, mobileOpen]);
  return (
    <>
      <a className="sr-only focus:not-sr-only" href="#main-content">
        Skip to main content
      </a>
      {mobileOpen && (
        <button
          className="mobile-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        />
      )}
      <aside
        ref={sidebar}
        id="workspace-navigation"
        className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}
        inert={narrow && !mobileOpen}
        aria-hidden={narrow && !mobileOpen ? true : undefined}
      >
        <Logo />
        <div className="workspace-select">
          <span className="workspace-icon">
            <Building2 size={16} />
          </span>
          <div>
            <strong>Meridian Bank</strong>
            <small>Intelligence workspace</small>
          </div>
          <ChevronsUpDown size={12} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="nav-list" aria-label="Main navigation">
          {navigation.slice(0, 6).map((n) => (
            <button
              key={n.label}
              className={`nav-item ${page === n.label ? "active" : ""}`}
              aria-current={page === n.label ? "page" : undefined}
              onClick={() => onPage(n.label)}
            >
              <n.icon />
              <span>{n.label}</span>
              {n.label === "Risk Radar" && riskCount !== undefined && (
                <span className="nav-count">{riskCount}</span>
              )}
            </button>
          ))}
        </nav>
        {chatHistory}
        <div className="nav-section-separator" />
        <div className="nav-label">RESOURCES</div>
        <nav className="nav-list" aria-label="Resources">
          {navigation.slice(6).map((n) => (
            <button
              key={n.label}
              className={`nav-item ${page === n.label ? "active" : ""}`}
              aria-current={page === n.label ? "page" : undefined}
              onClick={() => onPage(n.label)}
            >
              <n.icon />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="profile" onClick={onProfile}>
            <span className="avatar">AK</span>
            <span>
              <strong>Alex Kumar</strong>
              <small>
                {role ? role[0].toUpperCase() + role.slice(1) : "Loading permissions"} · Demo
                profile
              </small>
            </span>
            <ChevronDown size={13} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              aria-controls="workspace-navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={19} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={12} />
            <strong>{page}</strong>
          </div>
          <div className="topbar-actions">
            <span className="environment">
              <span className="status-dot" />
              Demo environment
            </span>
            <button className="topbar-search" onClick={onSearch} aria-label="Search workspace">
              <Search size={15} />
              <span>Search anything</span>
              <kbd>{isMac ? "⌘K" : "Ctrl K"}</kbd>
            </button>
            <div className="topbar-divider" />
            <button className="icon-button" onClick={onNotifications} aria-label="Notifications">
              <Bell size={17} />
              <i className="notification-dot" />
            </button>
            <button className="icon-button" onClick={onProfile} aria-label="Open profile">
              <span className="avatar">AK</span>
            </button>
          </div>
        </header>
        <main className="content" id="main-content">
          {children}
        </main>
      </div>
    </>
  );
}

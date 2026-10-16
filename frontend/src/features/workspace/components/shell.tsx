"use client";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Bell,
  BookOpen,
  Building2,
  ChevronDown,
  ChevronRight,
  FileText,
  CreditCard,
  LayoutDashboard,
  Menu,
  SquarePen,
  Radar,
  ScanLine,
  Settings2,
  Sparkles,
} from "lucide-react";
import type { Page } from "@/features/workspace/types";
import { Logo } from "@/shared/ui/primitives";
const navigation: { label: Page; icon: typeof Activity }[] = [
  { label: "Command Center", icon: LayoutDashboard },
  { label: "AI Analyst", icon: Sparkles },
  { label: "Risk Radar", icon: Radar },
  { label: "Investigations", icon: ScanLine },
  { label: "Card Campaigns", icon: CreditCard },
  { label: "Reports", icon: FileText },
  { label: "Settings", icon: Settings2 },
];
export const pages: Page[] = [...navigation.map((n) => n.label), "Knowledge", "Data Workspace"];
export function Shell({
  role,
  page,
  riskCount,
  onPage,
  onNewChat,
  chatLocked,
  headerControls,
  onNotifications,
  notificationCount = 0,
  signedIn,
  onLogin,
  onLogout,
  mobileOpen,
  setMobileOpen,
  chatHistory,
  children,
}: {
  role?: import("@/shared/lib/staff-role").StaffRole;
  page: Page;
  riskCount?: number;
  onPage: (page: Page) => void;
  onNewChat: () => void;
  chatLocked: boolean;
  headerControls?: React.ReactNode;
  onNotifications: () => void;
  notificationCount?: number;
  signedIn: boolean;
  onLogin: () => void;
  onLogout: () => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  children: React.ReactNode;
  chatHistory: React.ReactNode;
}) {
  const sidebar = useRef<HTMLElement>(null);
  const account = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
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
  useEffect(() => {
    if (!accountOpen) return;
    const close = (event: PointerEvent) => {
      if (!account.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [accountOpen]);
  const chatActions = (
    <div className="analyst-chat-actions">
      <button
        className="icon-button header-action"
        onClick={onNewChat}
        disabled={chatLocked}
        aria-label="Start a new chat"
        title="New chat"
      >
        <SquarePen size={18} aria-hidden="true" />
      </button>
    </div>
  );
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
        <nav className="nav-list" aria-label="Resources">
          <button
            className={`nav-item ${page === "Knowledge" ? "active" : ""}`}
            aria-current={page === "Knowledge" ? "page" : undefined}
            onClick={() => onPage("Knowledge")}
          >
            <BookOpen />
            <span>Knowledge Library</span>
          </button>
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
        <div className="sidebar-bottom" ref={account}>
          {accountOpen && (
            <div className="profile-menu" id="account-menu">
              <button
                type="button"
                onClick={() => {
                  onLogin();
                  setAccountOpen(false);
                }}
              >
                Log in
              </button>
              <button
                type="button"
                className="profile-menu-logout"
                onClick={() => {
                  onLogout();
                  setAccountOpen(false);
                }}
              >
                Log out
              </button>
            </div>
          )}
          <button
            className="profile"
            aria-expanded={accountOpen}
            aria-controls="account-menu"
            onClick={() => setAccountOpen((open) => !open)}
          >
            <span className="avatar">{signedIn ? "AK" : "?"}</span>
            <span>
              <strong>{signedIn ? "Alex Kumar" : "Signed out"}</strong>
              <small>
                {signedIn
                  ? `${role ? role[0].toUpperCase() + role.slice(1) : "Loading permissions"} · Demo profile`
                  : "Log in to continue"}
              </small>
            </span>
            <ChevronDown size={13} />
          </button>
        </div>
      </aside>
      <div className={`main-shell ${page === "AI Analyst" ? "main-shell--analyst" : ""}`}>
        <header className="topbar">
          <div className="topbar-navigation">
            <div className="topbar-left">
              <button
                className="icon-button mobile-menu"
                aria-label="Open navigation"
                aria-expanded={mobileOpen}
                aria-controls="workspace-navigation"
                onClick={() => setMobileOpen(true)}
              >
                <Menu size={19} />
              </button>
              <div className="breadcrumb">
                <span>Workspace</span>
                <ChevronRight size={12} />
                <strong>{page}</strong>
              </div>
            </div>
            <div className="topbar-actions">
              <button className="icon-button" onClick={onNotifications} aria-label="Notifications">
                <Bell size={17} />
                <i className="notification-dot" />
                {notificationCount > 0 && (
                  <span className="notification-count" aria-hidden="true">
                    {notificationCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>
        <main className="content" id="main-content">
          {page === "AI Analyst" && (
            <div className="analyst-toolbar" role="group" aria-label="Analysis controls">
              {headerControls}
              {chatActions}
            </div>
          )}
          {children}
        </main>
      </div>
    </>
  );
}

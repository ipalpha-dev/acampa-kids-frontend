import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { TabOverrideContext, type TabKey } from "../dashTab";
import { HideScanFabContext } from "../scanFab";
import { useCampTiming, type CampPhase } from "../campPhase";
import { useI18n } from "../i18n";
import { useRoute, useScrollTopOnRoute } from "../router";
import Logo from "../components/Logo";
import type { CampSummary } from "../auth/store";
import { campBrandLabel } from "../camps";
import { roleMeta, sortRoles, type Audience, type CoreRole, type LoggedUser } from "../roles";
import { ICONS } from "../icons";
import SyncStatus from "../components/SyncStatus";
import EmergencyScanFab from "../components/EmergencyScanFab";
import InstallBanner from "../components/InstallBanner";
import BedroomsPage from "./admin/BedroomsPage";
import RoomAssignPage from "./admin/RoomAssignPage";
import CampersPage from "./admin/CampersPage";
import CategoriesPage from "./admin/CategoriesPage";
import BusAssignPage from "./admin/BusAssignPage";
import CheckinSettingsPage from "./admin/CheckinSettingsPage";
import GeneralSettingsPage from "./admin/GeneralSettingsPage";
import AboutPage from "./admin/AboutPage";
import AdminCheckinPage from "./admin/AdminCheckinPage";
import SchedulePage from "./admin/SchedulePage";
import NotificationsPage from "./admin/NotificationsPage";
import ParentContactsPage from "./admin/ParentContactsPage";
import PreparationAdminPage from "./admin/PreparationAdminPage";
import PreparationPage from "./PreparationPage";
import InstructionsPage from "./InstructionsPage";
import InstructionsAdminPage from "./admin/InstructionsAdminPage";
import StaffPage from "./admin/StaffPage";
import BusCheckinPage from "./BusCheckinPage";
import BusTripsPage from "./BusTripsPage";
import TransportReport from "./TransportReport";
import CheckinPage from "./CheckinPage";
import HomePage from "./HomePage";
import MySchedulePage from "./MySchedulePage";
import OccurrencesPage from "./OccurrencesPage";
import MedicationsPage from "./MedicationsPage";
import StaffCheckinPage from "./StaffCheckinPage";
import VestPage from "./VestPage";
import TeamsPage from "./admin/TeamsPage";
import AssignToTeamsPage from "./admin/AssignToTeamsPage";
import TrialsPage from "./admin/TrialsPage";
import CleanupPage from "./admin/CleanupPage";
import SeedsPage from "./admin/SeedsPage";
import SuperPage from "./admin/SuperPage";
import Breadcrumbs from "../components/Breadcrumbs";
import ScoreboardPage from "./ScoreboardPage";
import GalleryPage from "./GalleryPage";
import { useCheckinHelper, type HelperAccess } from "../hooks/useCheckinHelper";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useParentWindow } from "../hooks/useParentWindow";
import { useCampWindow } from "../hooks/useCampWindow";
import { useCollection, useCollectionOrEmpty, useHydrated } from "../store";
import WizardPage from "../wizard/WizardPage";
import { campIsZeroed, setWizardDismissed, wizardDismissed } from "../wizard/state";
import ParentHomePage from "./parent/ParentHomePage";
import ParentPreparationPage from "./parent/ParentPreparationPage";
import ParentSchedulePage from "./parent/ParentSchedulePage";
import ParentProfile from "./parent/ParentProfile";
import { PAGE_FOOTER_ID } from "../components/PageFooter";
import CampAssistant from "../components/CampAssistant";
import { FabPortalProvider } from "../components/FabPortal";

interface DashboardProps {
  user: LoggedUser;
  token: string;
  camp: CampSummary;
  /** every camp this session may switch into — empty when it can't switch years */
  camps: CampSummary[];
  /** ends the session (server + this device) */
  onLogout: () => Promise<void>;
  /** acts as another role the same person holds (no SMS) */
  onSwitchRole: (role: CoreRole) => Promise<void>;
  /** switches the session into another year (admin, or an organizer of the active camp) */
  onSwitchCamp: (campId: string) => Promise<void>;
}

/** "profile" is not a tab: it opens when the user clicks their own name in the header. "settings" (phones only) is the settings MENU — the big list an entry is chosen from. "wizard" is the setup assistant, which takes over the whole body (no tabs). */
type View = TabKey | "profile" | "badge" | "settings" | "wizard" | SettingsKey;

/** Admin settings live behind the ⚙️ button; each one is its own URL (#/categories, #/settings). `superOnly`: just the deployment owner (SUPER_ADMIN_PHONE). */
type SettingsKey = "general" | "trials" | "categories" | "cleanup" | "preparation" | "instructions-admin" | "checkin-settings" | "contacts" | "notifications" | "super" | "about";
/** `adminOnly`: an ORGANIZER (Settings → Organizadores) gets every other page — these four stay with the real admin. `superOnly`: only the deployment owner. */
const SETTINGS: readonly { key: SettingsKey; label: string; emoji?: string; icon?: string; adminOnly?: boolean; superOnly?: boolean }[] = [
  { key: "general", label: "Geral", emoji: "⚙️" },
  { key: "preparation", label: "Preparação", icon: ICONS.preparation },
  { key: "instructions-admin", label: "Instruções", emoji: "📖" },
  { key: "checkin-settings", label: "Check-in", emoji: "✅" },
  { key: "contacts", label: "Contatos importantes", emoji: "📞" },
  { key: "notifications", label: "Notificações", icon: ICONS.notifications, adminOnly: true },
  { key: "trials", label: "Testes", emoji: "🚧" },
  { key: "categories", label: "Categorias", emoji: "🗂️", adminOnly: true },
  { key: "cleanup", label: "Limpeza", icon: ICONS.cleanup, adminOnly: true },
  { key: "super", label: "Acampamentos", icon: ICONS.superUser, adminOnly: true },
  { key: "about", label: "Sobre", emoji: "ℹ️", adminOnly: true },
] as const;

interface Tab {
  key: TabKey;
  label: string;
  /** paper-cut icon (same set as the login page) — takes precedence over emoji */
  icon?: string;
  emoji?: string;
}

/**
 * Which tabs each role gets, in order. First one is the default view.
 * For the team the order depends on the camp phase: while they are still
 * packing (more than 3 days before the first event) Preparação comes first;
 * from 3 days before onwards the room ("Início") takes the lead. "Instruções"
 * is the how-to of the person's own funções (always after the programme). A team
 * member listed as a helper gets "Check-in Igreja" / "Check-in Ônibus" while
 * the admin's window for that roll call is open; an ORGANIZER gets the whole
 * admin tab set on top of their own (the admin gets only the admin set); a GAME organizer gets the admin
 * "Programação" and a read-only "Equipe"; the MEDICAL team gets its own tab
 * set (`medicalTabs` — the kids, the occurrences and the medication
 * checklist, never the roll call); a VEST helper gets "Coletes";
 * everyone gets "Placar" while the camp is on, or while the admin's
 * "scoreboard draft" is on (read-only unless GAME organizer / score helper /
 * organizer / admin) — see hooks/useCheckinHelper and campPhase. The admin
 * (and organizers) open "Sorteio" from inside Acampantes / Equipe (not a tab).
 * "Fotos" only shows up for the TEAM once the album is published (`galleryOpen`):
 * before that there is nothing to see, so the tab would just be an empty page.
 */
function tabsFor(role: Audience, phase: CampPhase, helper: HelperAccess, roomsDraft: boolean, scoreOpen: boolean, galleryOpen: boolean, during: boolean): Tab[] {
  /** ordinary staff + score helpers keep Placar only while scoring is open. Managers always have one entry: Times before/after camp, Placar during it. */
  const scoreboard: Tab[] = scoreOpen ? [{ key: "scoreboard", label: "Placar", emoji: "🏆" }] : [];
  const managerTeamsTab: Tab = during ? { key: "scoreboard", label: "Placar", emoji: "🏆" } : { key: "teams", label: "Times", icon: ICONS.team };
  const prep: Tab = { key: "prep", label: "Preparação", icon: ICONS.preparation };
  const home: Tab = { key: "home", label: "Início", emoji: "🏠" };
  // rooms still a draft (Settings → Geral): nobody knows their room yet, so Preparação IS the home
  const teamHome: Tab[] = roomsDraft ? [prep] : phase === "before" ? [prep, home] : [home, prep];
  const adminTabs: Tab[] = [
    { key: "campers", label: "Acampantes", icon: ICONS.camper },
    { key: "staff", label: "Equipe", icon: ICONS.staff },
    { key: "bedrooms", label: "Quartos", icon: ICONS.bed },
    // the fleet + the kid-per-líder allocation board (was Settings → Transporte)
    { key: "buses", label: "Ônibus", icon: ICONS.transport },
    { key: "schedule", label: "Programação", icon: ICONS.schedule },
    { key: "checkin", label: "Check-in", emoji: "✅" },
    managerTeamsTab,
    { key: "occurrences", label: "Ocorrências", emoji: "📋" },
    // what the medical team ticked as given (they own the page; the admin follows it)
    { key: "medications", label: "Medicações", icon: ICONS.medications },
    // the photo album closes the tab row (admin / organizer view)
    { key: "gallery", label: "Fotos", icon: ICONS.camera },
  ];
  /** an ORGANIZER: their own room / preparation / instructions followed by everything the admin has */
  const managerTabs: Tab[] = [...teamHome, { key: "instructions", label: "Instruções", emoji: "📖" }, ...adminTabs];
  /**
   * The MEDICAL team (Settings → Equipe médica), in the order they work in:
   * their room, every kid (read-only, health included), the occurrences they
   * write and the daily medication checklist — then the programme, their own
   * preparação / instruções and the album. NO ônibus tab and no Placar: the
   * roll call and the games are not their job. A medical person who is ALSO a
   * listed helper (church roll call, ônibus, coletes) keeps that tab.
   */
  const medicalTabs: Tab[] = [
    // rooms still a draft: nobody knows their room yet, so "Início" would be empty
    ...(roomsDraft ? [] : [home]),
    { key: "campers", label: "Acampantes", icon: ICONS.camper },
    { key: "occurrences", label: "Ocorrências", emoji: "📋" },
    { key: "medications", label: "Medicações", icon: ICONS.medications },
    { key: "schedule", label: "Programação", icon: ICONS.schedule },
    prep,
    { key: "instructions", label: "Instruções", emoji: "📖" },
    ...(helper.church ? [{ key: "checkin" as const, label: "Check-in Igreja", emoji: "⛪" }] : []),
    ...(helper.bus ? [{ key: "bus" as const, label: "Check-in Ônibus", icon: ICONS.transport }] : []),
    ...(helper.vest ? [{ key: "vests" as const, label: "Coletes", emoji: "🦺" }] : []),
    ...(galleryOpen ? [{ key: "gallery" as const, label: "Fotos", icon: ICONS.camera }] : []),
  ];
  switch (role) {
    // the admin only manages: no room / preparation / instructions of their own
    case "admin":
      return adminTabs;
    // the team gets its room + a read-only programme; the KIDS' church roll call only as a helper inside the window
    case "staff":
      // an ORGANIZER: the admin's tabs on top of their own
      if (helper.organizer) return managerTabs;
      // the medical team has its own set: the kids and their medication, never the roll call
      if (helper.medical) return medicalTabs;
      return [
        ...teamHome,
        { key: "schedule", label: "Programação", icon: ICONS.schedule },
        { key: "instructions", label: "Instruções", emoji: "📖" },
        // game organizers get Times before/after camp and Placar during it; ordinary staff and score helpers keep Placar.
        ...(helper.gameOrganizer ? [managerTeamsTab] : scoreboard),
        ...(helper.gameOrganizer ? [{ key: "staff" as const, label: "Equipe", icon: ICONS.staff }] : []),
        ...(helper.church ? [{ key: "checkin" as const, label: "Check-in Igreja", emoji: "⛪" }] : []),
        // a bus helper rolls-call inside the window
        ...(helper.bus ? [{ key: "bus" as const, label: "Check-in Ônibus", icon: ICONS.transport }] : []),
        ...(helper.vest ? [{ key: "vests" as const, label: "Coletes", emoji: "🦺" }] : []),
        // the photo album is always the LAST tab — and only once it is published
        // (the photographers see it from the start, to send and publish)
        ...(galleryOpen ? [{ key: "gallery" as const, label: "Fotos", icon: ICONS.camera }] : []),
      ];
    // parents: their kids (Início) + the programme — the photos close the tab row
    case "parent":
      return [home, { key: "schedule", label: "Programação", icon: ICONS.schedule }, prep, { key: "gallery", label: "Fotos", icon: ICONS.camera }];
    default:
      return [];
  }
}

/**
 * Logged-in shell: header with the user + a tab bar; each tab renders a page.
 * Clicking the user's name opens their profile (no tab). Roles without tabs
 * land on the profile.
 */
export default function Dashboard({ user, token, camp, camps, onLogout, onSwitchRole, onSwitchCamp }: DashboardProps) {
  const { tx } = useI18n();
  const meta = roleMeta(user.activeRole);
  /** an archived year: read-only for everyone but the super admin (checked per write, on the server) */
  const isHistory = !camp.active;
  const activeCamp = camps.find((c) => c.active) ?? null;
  const brandLabel = campBrandLabel(camp.label, camp.year);
  const { phase, synced, during, endsAt } = useCampTiming();
  const isTeam = user.audience === "staff";
  const isParent = user.audience === "parent";
  const helper = useCheckinHelper(user.activeRole, user.personId, isTeam, endsAt);
  const parentAccess = useParentWindow(isParent);
  useCampWindow(isTeam && !helper.medical && !helper.organizer && !helper.scoreHelper, user.personId, during);
  const settings = useCollection("settings");
  const roomsDraft = !!settings?.kidsRoomsDraft;
  /** the scoreboard opens for everyone on the camp days; the "Placar em teste" switch opens it any day, but only for the admin, organizers, game organizers and score helpers */
  const scoreOpen = during || (!!settings?.scoreDraft && (user.audience === "admin" || helper.organizer || helper.gameOrganizer || helper.scoreHelper));
  /** the album shows up for the team once it is published; whoever manages it (organizer / photographer) always has the tab */
  const galleryOpen = !!settings?.galleryPublished || helper.organizer || helper.photographer;
  const tabs = tabsFor(user.audience, phase, helper, roomsDraft, scoreOpen, galleryOpen, during);
  /**
   * "ADM layout": eight or more visible tabs use the left navigation shell.
   * Despite the name, this is based ONLY on tab count and is never tied to the admin role.
   */
  const useDesktopSidebar = tabs.length >= 8;
  /**
   * PHONES ONLY (the class it drives does nothing above 700px). Six tabs of
   * which two are Preparação + Instruções: the bottom bar merges them into a
   * single 📖+mala entry, so the row fits five. Tapping it opens whichever the camp
   * phase calls for (before → Preparação, during / after → Instruções); the
   * other one is one tap away, from that page's header.
   */
  const mergesPrep = tabs.length === 6 && tabs.some((t) => t.key === "prep") && tabs.some((t) => t.key === "instructions");
  /** the half of the pair the merged entry opens — and the half it hides */
  const mergedKey: TabKey = phase === "before" ? "prep" : "instructions";
  const mergedHiddenKey: TabKey = mergedKey === "prep" ? "instructions" : "prep";
  /** what the bottom bar actually shows, in order */
  const bottomTabs = mergesPrep ? tabs.filter((t) => t.key !== mergedHiddenKey) : tabs;
  /** phone bottom bar: an odd count centres Início; an even one has no middle, so it leads */
  const bottomHomeIndex = bottomTabs.length % 2 === 1 ? Math.floor(bottomTabs.length / 2) : 0;
  const bottomNavOrder = (key: TabKey) => {
    if (key === "home") return bottomHomeIndex;
    const others = bottomTabs.filter((tab) => tab.key !== "home");
    const index = others.findIndex((tab) => tab.key === key);
    return index < bottomHomeIndex ? index : index + 1;
  };
  const { path, segments, navigate } = useRoute();
  /**
   * PHONES: the settings MENU (iPhone-style big list) opens from the drawer's
   * "Configurações" row; the app-bar ⚙️ lands directly on Geral, and every
   * section page carries a ‹ back link to the menu. 760px is the same query
   * the settings CSS switches at, so the two always agree. Desktop keeps the
   * sidebar layout, untouched.
   */
  const isPhone = useMediaQuery("(max-width: 760px)");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  useScrollTopOnRoute(path);
  useEffect(() => setMobileMenuOpen(false), [path]);
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileMenuOpen]);

  // the first URL segment is the tab: #/campers/…, #/staff/…, #/profile
  /** the admin, or a team member listed as ORGANIZER: the admin's pages and the ⚙️ settings (minus the admin-only ones) */
  const isAdmin = user.audience === "admin";
  const settingsAllowed = isAdmin || helper.organizer;
  /** camp-admin lock from the super-admin handover: wizard takes over until they finish or leave (the deployment owner is never locked); never during a history session */
  const wizardLocked = isAdmin && !!settings?.wizardMode && !settings?.superAdmin && !isHistory;
  /**
   * Phones: up to 5 menu entries (Perfil does NOT count — it lives in the app
   * bar as the person's name) become a bottom bar with an app bar above it;
   * anything bigger — or the ⚙️ roles, whose “Configurações” is one more entry
   * — keeps the hamburger drawer. Six tabs still fit when two of them are the
   * Preparação + Instruções pair, which shares one entry (`mergesPrep`).
   */
  const useMobileBottomNav = bottomTabs.length > 0 && bottomTabs.length <= 5 && !settingsAllowed;
  /** the settings pages this session may open (Sementes: deployment owner only; Limpeza: never on a history session) */
  const settingsPages = SETTINGS.filter((s) => (isAdmin || !s.adminOnly) && (!s.superOnly || !!settings?.superAdmin) && !(isHistory && s.key === "cleanup")).map((s) =>
    s.key === "super" ? { ...s, label: settings?.superAdmin ? "Superusuário" : "Acampamentos" } : s,
  );
  /** desktop ⚙️ landing — Notificações for the admin; organizers have no such page, so Geral */
  /** the settings page the ⚙️ lands on: always Geral — the menu (phones) stays one ‹ away */
  const settingsHome: SettingsKey = settingsPages.find((s) => s.key === "general")?.key ?? settingsPages[0].key;
  const isSettingsKey = (s: string | undefined): s is SettingsKey => settingsPages.some((x) => x.key === s);
  const managesTeams = settingsAllowed || helper.gameOrganizer;
  const isView = (s: string | undefined): s is View => s === "profile" || (s === "wizard" && isAdmin && !isHistory) || (s === "badge" && !isParent && during) || (settingsAllowed && (s === "settings" || isSettingsKey(s))) || (managesTeams && (s === "teams" || s === "scoreboard")) || tabs.some((t) => t.key === s);
  const rawView: View = isView(segments[0]) ? segments[0] : tabs[0]?.key ?? "profile";
  const view: View = wizardLocked && rawView !== "profile" && rawView !== "wizard" ? "wizard" : rawView;
  /** the tab we auto-landed on BEFORE the programme had arrived (the phase, hence the default, may still change) */
  const provisionalLanding = useRef<string | null>(null);
  /** login / reopen on #/profile must not show Perfil first; tapping the name later still works */
  const openedOnProfile = useRef(segments[0] === "profile");
  useEffect(() => {
    if (openedOnProfile.current && segments[0] === "profile") {
      const first = tabs[0]?.key;
      if (first) {
        openedOnProfile.current = false;
        navigate(`/${first}`, { replace: true });
        provisionalLanding.current = synced ? null : first;
      }
      return;
    }
    // no / unknown route → land on the first tab (replace so Back doesn't bounce here)
    if (!isView(segments[0])) {
      navigate(`/${view}`, { replace: true });
      provisionalLanding.current = synced ? null : view;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments[0], tabs.length, during]); // access windows closing bounce restricted pages home
  useEffect(() => {
    // the programme arrived after a provisional landing and the default tab changed → move there
    if (!synced || !provisionalLanding.current) return;
    const landed = provisionalLanding.current;
    provisionalLanding.current = null;
    const first = tabs[0]?.key;
    if (first && landed !== first && segments.length === 1 && segments[0] === landed) navigate(`/${first}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synced]);

  // ── the setup wizard opens by itself on a ZEROED camp (fresh or just cleaned) ──
  const wizardOpen = view === "wizard";
  const hydrated = useHydrated();
  const wizardAutoEntered = useRef(false);
  // the shell only counts records here: names are read by the screen being viewed, not by the shell
  const campersList = useCollectionOrEmpty("campers", { names: false });
  const staffList = useCollectionOrEmpty("staff", { names: false });
  const bedroomsList = useCollectionOrEmpty("bedrooms");
  const eventsList = useCollectionOrEmpty("events");
  const transportsList = useCollectionOrEmpty("transports");
  const prepList = useCollectionOrEmpty("preparation");
  const instrList = useCollectionOrEmpty("instructions");
  useEffect(() => {
    if (!isAdmin || !hydrated || isHistory) return;
    if (wizardLocked) {
      if (view !== "wizard" && view !== "profile") navigate("/wizard", { replace: true });
      return;
    }
    if (wizardAutoEntered.current || wizardOpen) return;
    // only the default landing walks in by itself — a deep link is respected
    if (segments.length !== 1 || segments[0] !== tabs[0]?.key) return;
    wizardAutoEntered.current = true;
    if (wizardDismissed()) return;
    if (
      campIsZeroed({
        campers: campersList,
        bedrooms: bedroomsList,
        events: eventsList,
        transports: transportsList,
        preparation: prepList,
        instructions: instrList,
        teamStaff: staffList.filter((s) => s.active),
      })
    ) {
      navigate("/wizard", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, isAdmin, view, wizardOpen, wizardLocked, segments, tabs, campersList, staffList, bedroomsList, eventsList, transportsList, prepList, instrList]);

  const profileOpen = view === "profile";
  /** admin settings (sidebar layout) — never for the team, even if a tab key happens to look alike */
  const settingsOpen = settingsAllowed && !wizardLocked && isSettingsKey(view);
  /** phones: the settings MENU (the big list the ⚙️ opens); picking an entry leaves it for that page */
  const settingsMenuOpen = settingsAllowed && !wizardLocked && view === "settings";
  // the phone menu route on a DESKTOP window (resized, or a link pasted around): the
  // sidebar already IS the menu there, so fall through to the first settings page
  useEffect(() => {
    if (settingsMenuOpen && !isPhone) navigate(`/${settingsHome}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsMenuOpen, isPhone]);
  /** pages that carry the yellow ScanFab (the scan IS the page's action): bulk points, church check-in, bus roll call (not the medical read-only view nor the per-vehicle report) */
  const reportOpen = segments[segments.length - 1] === "report";
  const hasOwnScanFab =
    (view === "scoreboard" && segments[1] === "bulk") ||
    (view === "checkin" && !reportOpen && (!settingsAllowed || segments[1] === "church" || (segments[1] === "bus" && (segments[2] === "outbound" || segments[2] === "return")))) ||
    (view === "bus" && helper.bus && (segments.length > 1 || !(helper.busOutbound && helper.busReturn)));
  /** a nested detail (e.g. função opened from a camper) can ask another tab to look active */
  const [tabOverride, setTabOverride] = useState<TabKey | null>(null);
  /**
   * How many FORMS are open right now (nova criança, editar equipe, novo
   * evento, nova ocorrência…). While any is, the "Ler crachá" FAB steps aside:
   * the bottom-right corner is the form's (Salvar / Cancelar). Counted, not a
   * flag — a dialog-form may open over a page-form (see scanFab.ts).
   */
  const [formsOpen, setFormsOpen] = useState(0);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const bumpFormsOpen = useCallback((delta: number) => setFormsOpen((n) => Math.max(0, n + delta)), []);
  const showEmergencyFab = !assistantOpen && !isParent && during && view !== "badge" && !wizardOpen && !settingsOpen && !settingsMenuOpen && !hasOwnScanFab && formsOpen === 0;
  const hasFab = !assistantOpen && (hasOwnScanFab || showEmergencyFab);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("has-bottom-nav", useMobileBottomNav);
    return () => root.classList.remove("has-bottom-nav");
  }, [useMobileBottomNav]);
  const routeTab: View = managesTeams && view === "teams" && during ? "scoreboard" : managesTeams && view === "scoreboard" && !during ? "teams" : view;
  const shownTab: View = !profileOpen && !settingsOpen && tabOverride ? tabOverride : routeTab;
  const currentTab = tabs.find((tab) => tab.key === shownTab);
  const currentSetting = settingsOpen ? settingsPages.find((item) => item.key === view) : undefined;
  const currentView = profileOpen
    ? { label: "Perfil", icon: meta.icon, emoji: undefined }
    : wizardOpen
      ? { label: "Assistente", icon: ICONS.wizard, emoji: undefined }
      : settingsMenuOpen
      ? { label: "Configurações", icon: undefined, emoji: "⚙️" }
      : currentSetting
      ? view === "super" && segments[1] === "seeds"
        ? { label: "Sementes", icon: undefined, emoji: "🌱" }
        : { label: currentSetting.label, icon: currentSetting.icon, emoji: currentSetting.emoji }
      : view === "badge"
        ? { label: "Ler crachá", icon: undefined, emoji: "🎟️" }
        : { label: currentTab?.label ?? "Acampa Kids", icon: currentTab?.icon, emoji: currentTab?.emoji };
  /** tab click → that tab's root list (a real history entry, so Back returns here) */
  function goTo(next: View) {
    setTabOverride(null);
    navigate(`/${next}`);
  }
  function goToTab(tab: Tab) {
    setTabOverride(null);
    // While camp is running the visible management tab is Placar; outside it is Times.
    navigate(`/${tab.key}`);
  }

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    navigate("/", { replace: true });
    await onLogout();
  }

  return (
    <div className={`dash ${useMobileBottomNav ? "dash--bottom-nav" : "dash--drawer-nav"}${useDesktopSidebar && !wizardOpen && !wizardLocked ? " dash--side-nav" : ""}${useDesktopSidebar && mobileMenuOpen ? " dash--side-nav-open" : ""}${settingsAllowed && !wizardLocked ? " dash--has-settings" : ""}${hasFab ? " dash--has-fab" : ""}`}>
      <FabPortalProvider>
      <div className="dash-chrome">
      <header className="dash-top">
        {tabs.length > 0 && !useMobileBottomNav && !wizardOpen && !wizardLocked && (
          <button
            type="button"
            className={`dash-iconbtn dash-menu-toggle ${mobileMenuOpen ? "dash-menu-toggle--open" : ""}`}
            title={mobileMenuOpen ? tx("Fechar menu") : tx("Abrir menu")}
            aria-label={mobileMenuOpen ? tx("Fechar menu") : tx("Abrir menu")}
            aria-expanded={mobileMenuOpen}
            aria-controls="dashboard-menu"
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            <span className="dash-menu-toggle__lines" aria-hidden="true"><i /><i /><i /></span>
          </button>
        )}

        <div className="dash-brand">
          <Logo size={48} />
          <span className="dash-brand__name">{brandLabel}</span>
        </div>

        <span className="dash-current-view" aria-live="polite">
          {currentView.icon ? (
            <img className="dash-current-view__icon" src={currentView.icon} alt="" aria-hidden="true" />
          ) : currentView.emoji ? (
            <span className="dash-current-view__emoji" aria-hidden="true">{currentView.emoji}</span>
          ) : null}
          <span className="dash-current-view__label">{tx(currentView.label)}</span>
        </span>

        <div className="dash-user">
          <SyncStatus />
          <button
            type="button"
            className={`role-chip dash-user__chip ${profileOpen ? "dash-user__chip--active" : ""}`}
            title={tx("Você entrou como {role} — ver perfil", { role: tx(meta.label) })}
            aria-pressed={profileOpen}
            onClick={() => {
              if (profileOpen) {
                if (wizardLocked) goTo("wizard");
                return;
              }
              goTo("profile");
            }}
          >
            <img className="role-chip__icon" src={meta.icon} alt="" aria-hidden="true" />
            {firstName(user.name) || tx("Perfil")}
          </button>
          {settingsAllowed && !wizardLocked && (
            <button
              type="button"
              className={`dash-iconbtn dash-settings-btn ${settingsOpen || settingsMenuOpen ? "dash-iconbtn--active" : ""}`}
              title={tx("Configurações: equipe, contatos, check-in e notificações")}
              aria-label={tx("Configurações")}
              aria-pressed={settingsOpen || settingsMenuOpen}
              /* the ⚙️ always lands on Geral; the phone menu stays reachable via the ‹ back link */
              onClick={() => goTo(settingsHome)}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 .1-1 7.6 7.6 0 0 0-.1-1l2.1-1.6a.5.5 0 0 0 .1-.7l-2-3.4a.5.5 0 0 0-.6-.2l-2.5 1a7.3 7.3 0 0 0-1.7-1l-.4-2.6a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 0-.5.5l-.4 2.6a7.3 7.3 0 0 0-1.7 1l-2.5-1a.5.5 0 0 0-.6.2l-2 3.4a.5.5 0 0 0 .1.7L4.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6a.5.5 0 0 0-.1.7l2 3.4c.1.2.4.3.6.2l2.5-1a7.3 7.3 0 0 0 1.7 1l.4 2.6c0 .3.2.5.5.5h4c.3 0 .5-.2.5-.5l.4-2.6a7.3 7.3 0 0 0 1.7-1l2.5 1c.2.1.5 0 .6-.2l2-3.4a.5.5 0 0 0-.1-.7L19.4 13ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" />
              </svg>
            </button>
          )}
          {/* phones, drawer layout: the church logo (no label) closes the app bar — unless
              this session has ⚙️, which takes that slot instead (see .dash--has-settings) */}
          <span className="dash-top-logo" aria-hidden="true"><Logo size={34} /></span>
        </div>
      </header>

      {isHistory && (
        <p className="camp-banner">
          🔒 <strong>{tx("{label} — arquivado, só leitura", { label: camp.label })}</strong>
          {activeCamp && (
            <button type="button" className="link-btn" onClick={() => void onSwitchCamp(activeCamp.id)}>
              {tx("Voltar para {year}", { year: activeCamp.year })}
            </button>
          )}
        </p>
      )}

      {tabs.length > 0 && !wizardOpen && !wizardLocked && (
      <nav id="dashboard-menu" className={`dash-tabs ${mobileMenuOpen ? "dash-tabs--open" : ""}`} role="tablist" aria-label={tx("Seções")}>
        {tabs.map((t) => {
          /** the merged 📖+mala entry (phone bottom bar only) stands in for BOTH halves */
          const merged = mergesPrep && t.key === mergedKey;
          const active = t.key === shownTab;
          /** already on this tab's root list → clicking does nothing, so no hover either */
          const atRoot = active && segments.length === 1 && segments[0] === t.key;
          /**
           * The OTHER half is open: the merged entry looks active in its place.
           * A class, not `active` — on the desktop both tabs exist, and lighting
           * up two of them at once is exactly what this must not do.
           */
          const standsIn = merged && shownTab === mergedHiddenKey;
          /** the half the bottom bar hides: still rendered, hidden by CSS on phones */
          const spare = mergesPrep && t.key === mergedHiddenKey;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              className={`dash-tab ${active ? "dash-tab--active" : ""} ${atRoot ? "dash-tab--root" : ""} ${merged ? "dash-tab--merged" : ""} ${standsIn ? "dash-tab--merged-active" : ""} ${spare ? "dash-tab--merged-spare" : ""}`}
              aria-disabled={atRoot || undefined}
              style={{ "--mobile-nav-order": bottomNavOrder(t.key) } as CSSProperties}
              onClick={() => {
                setMobileMenuOpen(false);
                if (!atRoot) goToTab(t);
              }}
            >
              {t.icon ? (
                <img className="dash-tab__icon" src={t.icon} alt="" aria-hidden="true" />
              ) : (
                <span className="dash-tab__emoji" aria-hidden="true">{t.emoji}</span>
              )}
              {/* 📖+mala — only the phone bottom bar shows this pair glyph */}
              {merged && (
                <span className="dash-tab__pair" aria-hidden="true">
                  <span>📖</span>
                  <i>+</i>
                  <img className="dash-tab__pair-icon" src={ICONS.preparation} alt="" />
                </span>
              )}
              <span className="dash-tab__label">{tx(t.label)}</span>
              {merged && <span className="dash-tab__pair-label">{tx("Instruções")}</span>}
            </button>
          );
        })}
        <button
          type="button"
          role="tab"
          aria-selected={profileOpen}
          className={`dash-tab dash-menu-profile ${profileOpen ? "dash-tab--active dash-tab--root" : ""}`}
          style={{ "--mobile-nav-order": tabs.length } as CSSProperties}
          onClick={() => {
            setMobileMenuOpen(false);
            if (!profileOpen) goTo("profile");
          }}
        >
          <img className="dash-tab__icon" src={meta.icon} alt="" aria-hidden="true" />
          <span className="dash-tab__label">{tx("Perfil")}</span>
        </button>
        {/* phones: for everyone else the ⚙️ would live here, in the drawer; admins /
            organizers keep it in the app bar instead, so this entry is hidden for them */}
        {settingsAllowed && !wizardLocked && (
          <button
            type="button"
            role="tab"
            aria-selected={settingsOpen || settingsMenuOpen}
            className={`dash-tab dash-menu-settings ${settingsOpen || settingsMenuOpen ? "dash-tab--active dash-tab--root" : ""}`}
            onClick={() => {
              setMobileMenuOpen(false);
              if (!settingsOpen && !settingsMenuOpen) goTo(isPhone ? "settings" : settingsHome);
            }}
          >
            <span className="dash-tab__emoji" aria-hidden="true">⚙️</span>
            <span className="dash-tab__label">{tx("Configurações")}</span>
          </button>
        )}
      </nav>
      )}
      </div>
      {mobileMenuOpen && !useMobileBottomNav && (
        <button type="button" className="dash-menu-backdrop" aria-label={tx("Fechar menu")} onClick={() => setMobileMenuOpen(false)} />
      )}

      <div className="dash-scroll">
      <InstallBanner parent={isParent} />

      <div className={`dash-workspace${useDesktopSidebar && !wizardOpen && !wizardLocked ? " dash-workspace--side-nav" : ""}`}>
      {useDesktopSidebar && !wizardOpen && !wizardLocked && (
        <nav className={`dash-side-nav ${mobileMenuOpen ? "dash-side-nav--open" : ""}`} aria-label={tx("Seções")}>
          <div className="dash-side-nav__brand">
            <Logo size={42} />
            <span>{brandLabel}</span>
          </div>

          <div className="dash-side-nav__menu">
            <h2 className="dash-side-nav__title">{tx("Seções")}</h2>
            <ul className="dash-side-nav__list">
              {tabs.map((t) => {
                const active = t.key === shownTab;
                const atRoot = active && segments.length === 1 && segments[0] === t.key;
                return (
                  <li key={t.key}>
                    <button
                      type="button"
                      aria-current={active ? "page" : undefined}
                      className={`dash-side-nav__item ${active ? "dash-side-nav__item--active" : ""}`}
                      onClick={() => {
                        setMobileMenuOpen(false);
                        if (!atRoot) goToTab(t);
                      }}
                    >
                      {t.icon ? (
                        <img className="dash-side-nav__icon" src={t.icon} alt="" aria-hidden="true" />
                      ) : (
                        <span className="dash-side-nav__emoji" aria-hidden="true">{t.emoji}</span>
                      )}
                      <span className="dash-side-nav__label">{tx(t.label)}</span>
                    </button>
                  </li>
                );
              })}
              {settingsAllowed && (
                <li>
                  <button
                    type="button"
                    aria-current={settingsOpen ? "page" : undefined}
                    className={`dash-side-nav__item ${settingsOpen ? "dash-side-nav__item--active" : ""}`}
                    onClick={() => {
                      setMobileMenuOpen(false);
                      if (!settingsOpen) goTo(settingsHome);
                    }}
                  >
                    <span className="dash-side-nav__emoji" aria-hidden="true">⚙️</span>
                    <span className="dash-side-nav__label">{tx("Configurações")}</span>
                  </button>
                </li>
              )}
            </ul>
          </div>

          <div className="dash-side-nav__footer">
            <SyncStatus />
            <div className="dash-side-nav__account">
              <button
                type="button"
                aria-current={profileOpen ? "page" : undefined}
                className={`dash-side-nav__item dash-side-nav__profile ${profileOpen ? "dash-side-nav__item--active" : ""}`}
                onClick={() => {
                  setMobileMenuOpen(false);
                  if (!profileOpen) goTo("profile");
                }}
              >
                <img className="dash-side-nav__icon" src={meta.icon} alt="" aria-hidden="true" />
                <span className="dash-side-nav__label">{firstName(user.name) || tx("Perfil")}</span>
              </button>
              <span className="dash-side-nav__version" aria-label={tx("Versão {version}", { version: __APP_VERSION__ })}>v{__APP_VERSION__}</span>
            </div>
          </div>
        </nav>
      )}

      <main className={`dash-body ${settingsOpen ? "dash-body--settings" : ""}`} role="tabpanel">
        {/* PHONES: the iPhone-style settings menu — one grouped card, one row per section */}
        {settingsMenuOpen && isPhone && (
          <nav className="settings-menu" aria-label={tx("Configurações")}>
            <ul className="settings-menu__list">
              {settingsPages.map((s) => (
                <li key={s.key} className="settings-menu__row">
                  <button type="button" className="settings-menu__item" onClick={() => goTo(s.key)}>
                    <span className="settings-menu__icon" aria-hidden="true">
                      {s.icon ? <img src={s.icon} alt="" /> : s.emoji}
                    </span>
                    <span className="settings-menu__label">{tx(s.label)}</span>
                    <span className="settings-menu__chevron" aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {/* PHONES: a section page carries a back link to the menu (desktop keeps the sidebar, never this) */}
        {settingsOpen && isPhone && (
          <button type="button" className="settings-back" onClick={() => goTo("settings")}>
            <span className="settings-back__arrow" aria-hidden="true">‹</span> {tx("Configurações")}
          </button>
        )}
        {settingsOpen && !isPhone && (
          <nav className="settings-nav" aria-label={tx("Configurações")}>
            <h2 className="settings-nav__title">⚙️ {tx("Configurações")}</h2>
            <ul className="settings-nav__list">
              {settingsPages.map((s) => {
                const active = s.key === view;
                return (
                  <li key={s.key}>
                    <button
                      type="button"
                      aria-current={active ? "page" : undefined}
                      className={`settings-nav__item ${active ? "settings-nav__item--active" : ""}`}
                      onClick={() => !active && goTo(s.key)}
                    >
                      {s.icon ? (
                        <img className="settings-nav__icon" src={s.icon} alt="" aria-hidden="true" />
                      ) : (
                        <span className="settings-nav__emoji" aria-hidden="true">{s.emoji}</span>
                      )}
                      <span className="settings-nav__label">{tx(s.label)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
        <TabOverrideContext.Provider value={setTabOverride}>
          <HideScanFabContext.Provider value={bumpFormsOpen}>
            {view === "badge" && <EmergencyScanFab token={token} page />}
            {view === "wizard" && (
              <WizardPage token={token} user={user} camp={camp} camps={camps} onExit={() => navigate("/", { replace: true })} />
            )}
            {view === "home" && (isParent ? <ParentHomePage user={user} token={token} access={parentAccess} /> : <HomePage user={user} token={token} medical={helper.medical} />)}
            {view === "prep" && (isParent ? <ParentPreparationPage user={user} token={token} /> : <PreparationPage user={user} token={token} pairedWith={mergesPrep ? () => goTo("instructions") : undefined} />)}
            {view === "preparation" && <PreparationAdminPage token={token} />}
            {view === "instructions-admin" && <InstructionsAdminPage token={token} />}
            {view === "instructions" && <InstructionsPage user={user} pairedWith={mergesPrep ? () => goTo("prep") : undefined} />}
            {view === "occurrences" && <OccurrencesPage token={token} audience={isAdmin ? "admin" : helper.organizer ? "organizer" : "medical"} />}
            {view === "medications" && <MedicationsPage token={token} />}
            {view === "campers" && <CampersPage token={token} camp={camp} camps={camps} readOnly={!settingsAllowed} locked={isHistory} />}
            {view === "staff" && <StaffPage token={token} camp={camp} camps={camps} readOnly={!settingsAllowed || isHistory} />}
            {view === "bedrooms" && segments[1] === "assign" &&
              (settingsAllowed && !isHistory ? <RoomAssignPage token={token} onBack={() => navigate("/bedrooms")} /> : <BedroomsPage token={token} readOnly />)}
            {view === "bedrooms" && segments[1] !== "assign" && <BedroomsPage token={token} readOnly={!settingsAllowed || isHistory} />}
            {view === "schedule" && (isParent ? <ParentSchedulePage /> : settingsAllowed || helper.gameOrganizer ? <SchedulePage token={token} readOnly={isHistory} /> : <MySchedulePage user={user} />)}
            {view === "categories" && <CategoriesPage token={token} />}
            {view === "buses" && <BusAssignPage token={token} />}
            {view === "general" && <GeneralSettingsPage token={token} />}
            {view === "trials" && <TrialsPage token={token} isAdmin={isAdmin} />}
            {view === "cleanup" && <CleanupPage token={token} camp={camp} onSwitchCamp={onSwitchCamp} />}
            {view === "super" && segments[1] === "seeds" && (
              <>
                <Breadcrumbs items={[{ label: tx(currentSetting?.label ?? "Acampamentos"), onClick: () => goTo("super") }, { label: tx("Sementes") }]} />
                <SeedsPage token={token} />
              </>
            )}
            {view === "super" && segments[1] !== "seeds" && <SuperPage token={token} user={user} camp={camp} onSwitchCamp={onSwitchCamp} />}
            {view === "checkin-settings" && <CheckinSettingsPage token={token} />}
            {view === "teams" && segments[1] === "assign" && <AssignToTeamsPage token={token} onBack={() => navigate("/teams")} onScoreboard={during ? () => navigate("/scoreboard") : undefined} />}
            {view === "teams" && segments[1] !== "assign" && <TeamsPage token={token} onAssign={() => navigate("/teams/assign")} onScoreboard={!during ? () => navigate("/scoreboard") : undefined} onScoreboardBack={during ? () => navigate("/scoreboard") : undefined} />}
            {view === "scoreboard" && <ScoreboardPage token={token} userId={user.id} canEdit={scoreOpen && (settingsAllowed || helper.gameOrganizer)} canScan={scoreOpen && (settingsAllowed || helper.gameOrganizer || helper.scoreHelper)} showTeamsButton={managesTeams && during} onTeams={() => navigate("/teams")} teamsParent={!during && managesTeams} />}
            {view === "gallery" && <GalleryPage token={token} canManage={settingsAllowed || helper.photographer} parentMode={isParent} />}
            {view === "contacts" && <ParentContactsPage token={token} />}
            {view === "notifications" && <NotificationsPage token={token} />}
            {view === "about" && <AboutPage token={token} />}
            {view === "checkin" && !settingsAllowed && <CheckinPage token={token} />}
            {view === "checkin" && settingsAllowed && segments.length === 1 && <AdminCheckinPage />}
            {view === "checkin" && settingsAllowed && segments[1] === "church" && <CheckinPage token={token} adminMerged />}
            {view === "checkin" && settingsAllowed && segments[1] === "bus" && segments.length === 2 && <BusTripsPage basePath="/checkin/bus" checkinHomePath="/checkin" />}
            {/* chegadas por veículo — the SAME report the church check-in opens, reachable from the bus roll call too */}
            {view === "checkin" && settingsAllowed && segments[1] === "bus" && segments[2] === "report" && (
              <TransportReport
                onBack={() => navigate("/checkin/bus")}
                onHome={() => navigate("/checkin")}
                onOpenStaff={(id) => navigate(`/staff/${id}`)}
                onOpenCamper={(id) => navigate(`/campers/${id}`)}
                via="bus"
              />
            )}
            {view === "checkin" && settingsAllowed && segments[1] === "bus" && segments[2] === "outbound" && <BusCheckinPage token={token} trip="outbound" basePath="/checkin/bus/outbound" checkinHomePath="/checkin" reportPath="/checkin/bus/report" />}
            {view === "checkin" && settingsAllowed && segments[1] === "bus" && segments[2] === "return" && <BusCheckinPage token={token} trip="return" basePath="/checkin/bus/return" checkinHomePath="/checkin" reportPath="/checkin/bus/report" />}
            {view === "checkin" && settingsAllowed && segments[1] === "staff" && <StaffCheckinPage token={token} checkinHomePath="/checkin" />}
            {view === "checkin" && settingsAllowed && segments[1] === "vests" && <VestPage token={token} checkinHomePath="/checkin" />}
            {view === "vests" && <VestPage token={token} />}
            {view === "bus" && segments.length === 1 && helper.bus && (
              helper.busOutbound && helper.busReturn
                ? <BusTripsPage outboundAvailable={helper.busOutbound} returnAvailable={helper.busReturn} />
                : <BusCheckinPage token={token} trip={helper.busReturn ? "return" : "outbound"} onlyVehicleId={helper.busVehicle ?? undefined} otherTripAvailable={false} />
            )}
            {view === "bus" && segments[1] === "outbound" && helper.busOutbound && <BusCheckinPage token={token} trip="outbound" onlyVehicleId={helper.busVehicle ?? undefined} otherTripAvailable={helper.busReturn} />}
            {view === "bus" && segments[1] === "return" && helper.busReturn && <BusCheckinPage token={token} trip="return" onlyVehicleId={helper.busVehicle ?? undefined} otherTripAvailable={helper.busOutbound} />}
            {view === "bus" && segments.length > 1 && helper.bus && ((segments[1] === "outbound" && !helper.busOutbound) || (segments[1] === "return" && !helper.busReturn)) && (
              <BusTripsPage outboundAvailable={helper.busOutbound} returnAvailable={helper.busReturn} />
            )}
            {view === "staffcheckin" && <StaffCheckinPage token={token} />}
            {view === "profile" && (isParent
              ? <ParentProfile token={token} user={user} onLogout={handleLogout} loggingOut={loggingOut} onSwitchRole={onSwitchRole} />
              : (
                <ProfileView
                  user={user}
                  isAdmin={isAdmin}
                  camp={camp}
                  camps={camps}
                  onLogout={handleLogout}
                  loggingOut={loggingOut}
                  onSwitchRole={onSwitchRole}
                  onSwitchCamp={onSwitchCamp}
                  onOpenWizard={isAdmin && !isHistory ? () => { setWizardDismissed(false); goTo("wizard"); } : undefined}
                />
              ))}
          </HideScanFabContext.Provider>
        </TabOverrideContext.Provider>
      </main>
      </div>

      {/* every page's closing note lands here (see PageFooter) */}
      <footer className="dash-foot" id={PAGE_FOOTER_ID} />
      </div>

      {/* "Ler crachá" QR lookup — the team, WHILE THE CAMP IS ON (first day → end of the last event), on every page except the settings, the pages whose own yellow ScanFab performs their action, and any page showing a FORM (its Salvar / Cancelar own that corner) */}
      {showEmergencyFab && <EmergencyScanFab token={token} />}
      {(settingsAllowed || helper.medical) && !wizardLocked && !wizardOpen && (
        <CampAssistant
          token={token}
          userName={user.name}
          availableTabs={tabs.map((tab) => tab.key)}
          availableSettings={settingsPages.map((page) => page.key)}
          avoidFab={hasFab}
          onOpenChange={setAssistantOpen}
        />
      )}
      </FabPortalProvider>
    </div>
  );
}

/** "Ana Maria" → "Ana" ("" while the name is not known yet) */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

function ProfileView({
  user,
  isAdmin,
  camp,
  camps,
  onLogout,
  loggingOut,
  onSwitchRole,
  onSwitchCamp,
  onOpenWizard,
}: {
  user: LoggedUser;
  isAdmin: boolean;
  camp: CampSummary;
  camps: CampSummary[];
  onLogout: () => void;
  loggingOut: boolean;
  onSwitchRole: (role: CoreRole) => Promise<void>;
  onSwitchCamp: (campId: string) => Promise<void>;
  /** coordenação only: reopen the setup wizard */
  onOpenWizard?: () => void;
}) {
  const { tx, te } = useI18n();
  const meta = roleMeta(user.activeRole);
  const otherRoles = sortRoles(user.roles.filter((r) => r !== user.activeRole));
  const [switchingTo, setSwitchingTo] = useState<CoreRole | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [switchingCampTo, setSwitchingCampTo] = useState<string | null>(null);
  const [campSwitchError, setCampSwitchError] = useState<string | null>(null);

  /** one tap on another role enters it — there is nothing to confirm */
  async function enterAs(role: CoreRole) {
    if (switchingTo) return;
    setSwitchingTo(role);
    setSwitchError(null);
    try {
      await onSwitchRole(role);
    } catch (err) {
      setSwitchError(te(err, "Não foi possível trocar de perfil."));
      setSwitchingTo(null);
    }
  }

  /** one tap on another year enters it — no confirm, same as switching roles */
  async function enterCamp(id: string) {
    if (switchingCampTo) return;
    setSwitchingCampTo(id);
    setCampSwitchError(null);
    try {
      await onSwitchCamp(id);
    } catch (err) {
      setCampSwitchError(te(err, "Não foi possível trocar de ano."));
      setSwitchingCampTo(null);
    }
  }

  return (
    <div className="screen screen--narrow profile-screen">
      <div className="confetti" aria-hidden="true">🎉 🏕️ ✨ 🌲 🎈</div>

      <h1 className="title title--small">{firstName(user.name) ? tx("Boas-vindas, {name}! 🎉", { name: firstName(user.name) }) : tx("Boas-vindas! 🎉")}</h1>
      <p className="subtitle">{tx("Você entrou como {role}", { role: tx(meta.label) })}</p>

      <div className="user-card">
        <div className="user-card__row">
          <span className="user-card__label">{tx("Nome")}</span>
          <span className="user-card__value">{user.name || "—"}</span>
        </div>
        <div className="user-card__row">
          <span className="user-card__label">{tx("Perfil")}</span>
          {/* the one they are already in: a plain label, nothing to tap */}
          <span className="role-chip role-chip--small role-chip--bare">
            <img className="role-chip__icon" src={meta.icon} alt="" aria-hidden="true" /> {tx(meta.label)}
          </span>
        </div>
        {otherRoles.length > 0 && (
          <div className="user-card__row">
            <span className="user-card__label">{tx("Outros perfis")}</span>
            <span className="user-card__roles">
              {otherRoles.map((r) => {
                const m = roleMeta(r);
                return (
                  <button
                    key={r}
                    type="button"
                    className={`role-chip role-chip--${m.color} role-chip--small role-chip--switch`}
                    disabled={!!switchingTo}
                    onClick={() => void enterAs(r)}
                    title={tx("Entrar como {role}", { role: tx(m.label) })}
                  >
                    <img className="role-chip__icon" src={m.icon} alt="" aria-hidden="true" /> {switchingTo === r ? tx("Entrando…") : tx(m.label)}
                  </button>
                );
              })}
            </span>
          </div>
        )}
        {camps.length > 1 && (
          <div className="user-card__row">
            <span className="user-card__label">{tx("Ano")}</span>
            <span className="user-card__roles">
              {camps.map((c) => {
                const current = c.id === camp.id;
                const label = `${c.active ? "" : "🔒 "}${c.year}`;
                return current ? (
                  <span key={c.id} className="role-chip role-chip--small role-chip--bare">
                    {label}
                  </span>
                ) : (
                  <button
                    key={c.id}
                    type="button"
                    className="role-chip role-chip--small role-chip--switch"
                    disabled={!!switchingCampTo}
                    onClick={() => void enterCamp(c.id)}
                    title={tx("Entrar em {year}", { year: c.year })}
                  >
                    {switchingCampTo === c.id ? tx("Entrando…") : label}
                  </button>
                );
              })}
            </span>
          </div>
        )}
      </div>

      <p className="cat-hint profile-screen__core-note">{tx("Seus dados pessoais (celular, e-mail, saúde) ficam guardados no IPAlpha, em Meus dados.")}</p>

      {switchError && <p className="message message--error">{switchError}</p>}
      {campSwitchError && <p className="message message--error">{campSwitchError}</p>}

      <div className="profile-actions">
        {onOpenWizard && isAdmin && (
          <button type="button" className="button button--secondary profile-wizard" onClick={onOpenWizard}>
            <img className="audience-icon" src={ICONS.wizard} alt="" aria-hidden="true" /> {tx("Assistente de configuração")}
          </button>
        )}
        <button type="button" className="button button--danger profile-logout" onClick={onLogout} disabled={loggingOut}>
          {loggingOut ? tx("Saindo…") : tx("Sair do aplicativo")}
        </button>
      </div>
    </div>
  );
}

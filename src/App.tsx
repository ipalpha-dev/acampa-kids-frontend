import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { ApiError, CORE_UNAVAILABLE_EVENT, SESSION_ENDED_EVENT } from "./api/client";
import CampingLayout from "./components/CampingLayout";
import IpalphaOneTap from "./components/ipalpha/IpalphaOneTap";
import MaintenanceScene from "./components/MaintenanceScene";
import StaffAccessDialog from "./components/StaffAccessDialog";
import Toast from "./components/Toast";
import { fetchIpalphaConfig, type IpalphaConfig } from "./auth/ipalpha";
import {
  clearAuth,
  clearPendingOtp,
  loadAuth,
  loadPendingOtp,
  logout,
  saveAuth,
  savePendingOtp,
  switchCamp,
  switchRole,
  validateAuth,
  type AuthState,
  type LoginResult,
  type PendingOtp,
  type SwitchResult,
} from "./auth/store";
import { useIpalphaSignIn } from "./auth/useIpalphaSignIn";
import Dashboard from "./pages/Dashboard";
import RoleSwitchDialog from "./components/RoleSwitchDialog";
import OtpStep from "./pages/OtpStep";
import PhoneStep from "./pages/PhoneStep";
import { useI18n } from "./i18n";
import type { CoreRole } from "./roles";
import { clearRoomsDraft } from "./roomDraft";
import { navigate } from "./router";
import { endOfflineSession, startOfflineSession } from "./store";
import { connectRealtime, disconnectRealtime, IMPORT_NEEDS_SIGN_IN_EVENT } from "./store/realtime";

type Session = AuthState;

export default function App() {
  const { t, tx } = useI18n();
  const [otp, setOtp] = useState<PendingOtp | null>(() => (loadAuth() ? null : loadPendingOtp()));
  const [phoneMasked, setPhoneMasked] = useState("");
  /** gentle note on the login screen: not in this camp's project, or the session ended */
  const [loginNote, setLoginNote] = useState<string | null>(null);
  /** set when the server kicked the person out because the team's access window closed */
  const [evicted, setEvicted] = useState<ApiError | null>(null);
  /** CAMP_ARCHIVED / CAMP_FORBIDDEN messages from anywhere in the app (see api/client.ts) */
  const [campToast, setCampToast] = useState<string | null>(null);

  // restore an existing session (still within its sliding window)
  const [session, setSession] = useState<Session | null>(() => loadAuth());
  /** just logged in holding more than one role: ask which one before letting them in */
  const [choosingRole, setChoosingRole] = useState(false);
  /** "Entrar com IPAlpha" + One Tap: null = feature off (or not known yet) */
  const [ipalphaConfig, setIpalphaConfig] = useState<IpalphaConfig | null>(null);
  /** IPAlpha (core) unreachable from either login path → the "em manutenção" scene */
  const [maintenance, setMaintenance] = useState(false);
  /** the One Tap banner said none/close: hidden for the rest of this page view */
  const [oneTapDismissed, setOneTapDismissed] = useState(false);
  const [configNonce, setConfigNonce] = useState(0);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const loggedIn = !!session;
  useEffect(() => {
    if (loggedIn) return;
    let alive = true;
    fetchIpalphaConfig().then((config) => alive && setIpalphaConfig(config));
    return () => {
      alive = false;
    };
  }, [loggedIn, configNonce]);

  /**
   * Ends the session on this device: the offline copy is wiped (its key dies
   * with the session), the socket closed, and the login comes back with an
   * optional gentle note.
   */
  const endSession = useCallback((note: string | null) => {
    clearAuth();
    clearPendingOtp();
    // the unsaved room plan holds person ids of this session's camp: it goes with the session
    clearRoomsDraft();
    disconnectRealtime();
    void endOfflineSession();
    setSession(null);
    setChoosingRole(false);
    setOtp(null);
    setPhoneMasked("");
    setLoginNote(note);
  }, []);

  /** Same landing for every login path (SMS code or IPAlpha): save, then the role chooser when there is more than one. */
  function finishLogin({ token, tokenExpiresAt, user, camp, camps }: LoginResult) {
    clearPendingOtp();
    setOtp(null);
    setLoginNote(null);
    const next: Session = { token, tokenExpiresAt, user, camp, camps: camps ?? [] };
    saveAuth(next);
    setSession(next);
    setChoosingRole(user.roles.length > 1);
  }

  const showMaintenance = useCallback(() => setMaintenance(true), []);
  const showNotInProject = useCallback(() => setLoginNote(t("login.notInProject")), [t]);
  const ipalpha = useIpalphaSignIn({ config: ipalphaConfig, onSignedIn: finishLogin, onUnavailable: showMaintenance, onNotInProject: showNotInProject });

  // a restored session: refresh the person's view (name read live, roles re-checked) in the background.
  // A 401 there fires SESSION_ENDED_EVENT (handled below); offline keeps the saved session.
  useEffect(() => {
    const stored = sessionRef.current;
    if (!stored) return;
    validateAuth(stored.token).then((res) => {
      const current = sessionRef.current;
      if (!res || !current || current.token !== stored.token) return;
      const next = { ...current, user: res.user, camp: res.camp, camps: res.camps };
      saveAuth(next);
      setSession(next);
    });
  }, []);

  // any authenticated call answering 401 (SESSION_ENDED from core, or the session gone) → back to the login, gently
  useEffect(() => {
    if (!session) return;
    const onEnded = () => endSession(t("login.sessionEnded"));
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, onEnded);
  }, [session, endSession, t]);

  // IPAlpha in maintenance while signed in: a gentle toast, the camp keeps working with what is on the device
  useEffect(() => {
    const onCoreDown = () => setCampToast(tx("O IPAlpha está em manutenção agora. O acampamento continua funcionando com o que já está no aparelho."));
    // decision 50: an import I started paused its health pass — resume it in Configurações → Geral
    const onImportPaused = () => setCampToast(tx("Uma importação sua pausou as informações de saúde. Abra Configurações → Geral para continuar."));
    window.addEventListener(CORE_UNAVAILABLE_EVENT, onCoreDown);
    window.addEventListener(IMPORT_NEEDS_SIGN_IN_EVENT, onImportPaused);
    return () => {
      window.removeEventListener(CORE_UNAVAILABLE_EVENT, onCoreDown);
      window.removeEventListener(IMPORT_NEEDS_SIGN_IN_EVENT, onImportPaused);
    };
  }, [tx]);

  useEffect(() => {
    function onCampError(e: Event) {
      const detail = (e as CustomEvent<{ code: string; message: string }>).detail;
      if (!detail) return;
      if (detail.code === "CAMP_ARCHIVED") {
        setCampToast(detail.message || tx("Este ano está arquivado — só leitura."));
      } else if (detail.code === "CAMP_FORBIDDEN") {
        setCampToast(tx("Você não tem acesso a esse ano."));
        const activeId = session?.camps.find((c) => c.active)?.id;
        if (activeId && activeId !== session?.camp.id) void applyCamp(activeId);
      }
    }
    window.addEventListener("acampa:camp-error", onCampError);
    return () => window.removeEventListener("acampa:camp-error", onCampError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // the encrypted offline copy belongs to ONE session + role + camp: a new scope starts a new copy
  const token = session?.token ?? null;
  const campId = session?.camp.id ?? null;
  const scopeKey = session ? `${session.user.activeRole}|${session.camp.id}` : null;
  useEffect(() => {
    // no session on this device (expired, never signed in): nothing may stay stored
    if (!token || !campId) {
      void endOfflineSession();
      return;
    }
    void startOfflineSession(token, campId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, scopeKey]);

  // live data feed: one WebSocket per session scope (a role / camp switch reconnects with the new scope)
  useEffect(() => {
    if (!token) return;
    connectRealtime(token, {
      onUnauthorized: (reason) => {
        const activeRole = sessionRef.current?.user.audience;
        endSession(reason === "access-window-closed" ? null : t("login.sessionEnded"));
        if (reason === "access-window-closed") {
          setEvicted(new ApiError(401, "STAFF_ACCESS_ENDED", "O acampamento acabou.", { audience: activeRole === "parent" ? "parent" : "staff" }));
        }
      },
    });
    return () => disconnectRealtime();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, scopeKey]);

  /** Applies a role / camp switch answer: same token, new scope → the old offline copy is wiped before the new socket brings its snapshot. */
  async function applySwitch(res: SwitchResult) {
    const current = sessionRef.current;
    if (!current) return;
    await endOfflineSession();
    const next: Session = { token: current.token, tokenExpiresAt: res.tokenExpiresAt, user: res.user, camp: res.camp, camps: res.camps ?? current.camps };
    saveAuth(next);
    setSession(next);
    // the other role has its own menu: drop the path and land on its first tab
    navigate("/", { replace: true });
  }

  async function applyRole(role: CoreRole) {
    const current = sessionRef.current;
    if (!current) return;
    try {
      await applySwitch(await switchRole(current.token, role));
    } catch (err) {
      // the role is gone in core: it leaves this session's list
      if (err instanceof ApiError && err.code === "ROLE_FORBIDDEN") {
        const next = { ...current, user: { ...current.user, roles: current.user.roles.filter((r) => r !== role) } };
        saveAuth(next);
        setSession(next);
        throw new ApiError(err.status, err.code, t("login.roleGone"));
      }
      throw err;
    }
  }

  /** coordenação / super admin: switches into another year */
  async function applyCamp(campId: string) {
    const current = sessionRef.current;
    if (!current) return;
    await applySwitch(await switchCamp(current.token, campId));
  }

  async function handleLogout() {
    const current = sessionRef.current;
    if (current) await logout(current.token);
    endSession(null);
  }

  /** Holds more than one role: the choice comes BEFORE the app, over the login scenery. */
  if (session && choosingRole) {
    return (
      <>
        <VersionMark />
        <CampingLayout>
          <h1 className="camping-panel__title">{session.user.name ? t("login.almostThere", { name: session.user.name.split(" ")[0] }) : t("login.chooseProfile")}</h1>
        </CampingLayout>
        <RoleSwitchDialog
          open
          user={session.user}
          onClose={() => setChoosingRole(false)}
          onSwitch={async (role) => {
            await applyRole(role);
            setChoosingRole(false);
          }}
        />
        <Toast message={campToast} onClose={() => setCampToast(null)} />
      </>
    );
  }

  if (session) {
    return (
      <>
        <VersionMark />
        <Dashboard
          user={session.user}
          token={session.token}
          camp={session.camp}
          camps={session.camps}
          onLogout={handleLogout}
          onSwitchRole={applyRole}
          onSwitchCamp={applyCamp}
        />
        <Toast message={campToast} onClose={() => setCampToast(null)} />
      </>
    );
  }

  let content: ReactElement;
  if (maintenance) {
    content = (
      <MaintenanceScene
        onRetry={() => {
          setMaintenance(false);
          setConfigNonce((n) => n + 1);
        }}
      />
    );
  } else if (otp) {
    content = (
      <OtpStep
        key={otp.challenge}
        challenge={otp.challenge}
        phoneMasked={otp.phoneHint}
        expiresAt={otp.expiresAt}
        codeLength={otp.codeLength}
        onVerified={finishLogin}
        onBack={() => {
          clearPendingOtp();
          setOtp(null);
        }}
        onNotInProject={() => {
          clearPendingOtp();
          setOtp(null);
          showNotInProject();
        }}
        onUnavailable={showMaintenance}
      />
    );
  } else {
    content = (
      <PhoneStep
        phone={phoneMasked}
        onPhoneChange={(v) => {
          setPhoneMasked(v);
          if (loginNote) setLoginNote(null);
        }}
        note={loginNote}
        onSent={(pending) => {
          savePendingOtp(pending);
          setLoginNote(null);
          setOtp(pending);
        }}
        onNotInProject={showNotInProject}
        onUnavailable={showMaintenance}
        ipalpha={ipalphaConfig ? { busy: ipalpha.busy, error: ipalpha.error, notice: ipalpha.notice, onStart: () => ipalpha.start() } : undefined}
      />
    );
  }

  const showOneTap = !!ipalphaConfig && !otp && !maintenance && !oneTapDismissed;

  return (
    <>
      <VersionMark />
      <CampingLayout>{content}</CampingLayout>
      {showOneTap && ipalphaConfig && (
        <IpalphaOneTap
          authOrigin={ipalphaConfig.authOrigin}
          clientId={ipalphaConfig.clientId}
          entryPoint={ipalphaConfig.entryPoint}
          title={t("oneTap.title")}
          onSelect={(personId) => ipalpha.start(personId)}
          onOther={() => ipalpha.start()}
          onDismiss={() => setOneTapDismissed(true)}
        />
      )}
      <StaffAccessDialog error={evicted} onClose={() => setEvicted(null)} />
      <StaffAccessDialog error={ipalpha.accessError} onClose={ipalpha.clearAccessError} />
      <Toast message={campToast} onClose={() => setCampToast(null)} />
    </>
  );
}

function VersionMark() {
  const { t } = useI18n();
  return <span className="version-mark" aria-label={t("common.version", { version: __APP_VERSION__ })}>v{__APP_VERSION__}</span>;
}

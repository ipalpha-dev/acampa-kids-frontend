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
  fetchMe,
  loadPendingOtp,
  loadStoredSession,
  logout,
  saveAuth,
  savePendingOtp,
  switchCamp,
  switchRole,
  type AuthState,
  type LoginResult,
  type PendingOtp,
  type StoredSession,
  type SwitchResult,
} from "./auth/store";
import { useIpalphaSignIn } from "./auth/useIpalphaSignIn";
import styles from "./App.module.scss";
import Dashboard from "./pages/Dashboard";
import RoleSwitchDialog from "./components/RoleSwitchDialog";
import OtpStep from "./pages/OtpStep";
import PhoneStep from "./pages/PhoneStep";
import { useI18n } from "./i18n";
import type { CoreRole } from "./roles";
import { clearRoomsDraft } from "./roomDraft";
import { navigate } from "./router";
import { endOfflineSession, startOfflineSession } from "./store";
import { connectRealtime, disconnectRealtime } from "./store/realtime";

type Session = AuthState;

export default function App() {
  const { t, tx } = useI18n();
  /**
   * A token left by a previous page view: its identity (name, roles, camp) is
   * never stored — it is read with GET /api/auth/me before the app opens.
   */
  const [restoring, setRestoring] = useState<StoredSession | null>(() => loadStoredSession());
  /** /me could not be reached while restoring: offline (retry) or IPAlpha in maintenance */
  const [restoreFailed, setRestoreFailed] = useState<"offline" | "maintenance" | null>(null);
  const [restoreNonce, setRestoreNonce] = useState(0);
  const [otp, setOtp] = useState<PendingOtp | null>(() => (loadStoredSession() ? null : loadPendingOtp()));
  const [phoneMasked, setPhoneMasked] = useState("");
  /** gentle note on the login screen: not in this camp's project, or the session ended */
  const [loginNote, setLoginNote] = useState<string | null>(null);
  /** set when the server kicked the person out because the team's access window closed */
  const [evicted, setEvicted] = useState<ApiError | null>(null);
  /** CAMP_ARCHIVED / CAMP_FORBIDDEN messages from anywhere in the app (see api/client.ts) */
  const [campToast, setCampToast] = useState<string | null>(null);

  // the live session: memory only (auth/store keeps just the token on the device)
  const [session, setSession] = useState<Session | null>(null);
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

  const loggedIn = !!session || !!restoring;
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
    setRestoring(null);
    setRestoreFailed(null);
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

  // a token from a previous page view: read who it is (GET /me, name read live, roles re-checked) before
  // opening the app. 401 / a refusal → the login, gently; offline / maintenance → wait and retry.
  useEffect(() => {
    const stored = restoring;
    if (!stored) return;
    let alive = true;
    setRestoreFailed(null);
    fetchMe(stored.token)
      .then((res) => {
        if (!alive) return;
        const next: Session = { token: stored.token, tokenExpiresAt: res.tokenExpiresAt ?? stored.tokenExpiresAt, user: res.user, camp: res.camp, camps: res.camps };
        saveAuth(next);
        setSession(next);
        setRestoring(null);
      })
      .catch((err) => {
        if (!alive) return;
        if (err instanceof ApiError && err.status === 0) return setRestoreFailed("offline");
        if (err instanceof ApiError && (err.code === "IPALPHA_UNAVAILABLE" || err.status >= 500)) return setRestoreFailed("maintenance");
        // the session is gone (401) or refused (closed access window, not in the project)
        endSession(err instanceof ApiError && err.code.startsWith("STAFF_ACCESS") ? null : t("login.sessionEnded"));
        if (err instanceof ApiError && err.code.startsWith("STAFF_ACCESS")) setEvicted(err);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoring, restoreNonce]);

  // offline while restoring: try again as soon as the device is back online
  useEffect(() => {
    if (restoreFailed !== "offline") return;
    const retry = () => setRestoreNonce((n) => n + 1);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [restoreFailed]);

  // sliding expiry + live identity: coming back to the app re-reads /me (at most every 10 minutes)
  const lastMeAt = useRef(Date.now());
  useEffect(() => {
    if (!session) return;
    const onVisible = () => {
      const current = sessionRef.current;
      if (document.visibilityState !== "visible" || !current || Date.now() - lastMeAt.current < 10 * 60_000) return;
      lastMeAt.current = Date.now();
      fetchMe(current.token)
        .then((res) => {
          const latest = sessionRef.current;
          if (!latest || latest.token !== current.token) return;
          const next: Session = { ...latest, tokenExpiresAt: res.tokenExpiresAt ?? latest.tokenExpiresAt, user: res.user, camp: res.camp, camps: res.camps };
          saveAuth(next);
          setSession(next);
        })
        .catch(() => undefined); // a 401 fires SESSION_ENDED (handled below); offline keeps the session
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [session]);

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
    window.addEventListener(CORE_UNAVAILABLE_EVENT, onCoreDown);
    return () => window.removeEventListener(CORE_UNAVAILABLE_EVENT, onCoreDown);
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
    // no session on this device (expired, never signed in): nothing may stay stored.
    // While a stored token is being restored (/me) the sealed copy waits for it.
    if (!token || !campId) {
      if (!restoring) void endOfflineSession();
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
    const next: Session = { token: current.token, tokenExpiresAt: res.tokenExpiresAt || current.tokenExpiresAt, user: res.user, camp: res.camp, camps: res.camps ?? current.camps };
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

  /** A stored token whose identity is still being read (or could not be yet). */
  if (restoring) {
    if (restoreFailed === "maintenance") {
      return (
        <>
          <VersionMark />
          <CampingLayout>
            <MaintenanceScene onRetry={() => setRestoreNonce((n) => n + 1)} />
          </CampingLayout>
        </>
      );
    }
    return (
      <>
        <VersionMark />
        <CampingLayout>
          <RestoringSession
            offline={restoreFailed === "offline"}
            onRetry={() => setRestoreNonce((n) => n + 1)}
            onSignOut={() => {
              // best effort: revoke the stored session on the server too (it may be unreachable now)
              void logout(restoring.token);
              endSession(null);
            }}
          />
        </CampingLayout>
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

/** Opening a stored session: a calm "abrindo…", or — with no connection — a gentle note + retry. */
function RestoringSession({ offline, onRetry, onSignOut }: { offline: boolean; onRetry: () => void; onSignOut: () => void }) {
  const { tx } = useI18n();
  return (
    <div className={styles.restore} role="status" aria-live="polite">
      <h1 className="camping-panel__title">{tx("Abrindo o acampamento…")}</h1>
      <div className={`${styles.reveal} ${offline ? styles.revealOpen : ""}`}>
        <div className={styles.revealInner}>
          {offline && (
            <>
              <p className={styles.note}>{tx("Sem conexão com o servidor agora. Assim que a internet voltar, a gente continua de onde parou.")}</p>
              <div className={styles.actions}>
                <button type="button" className="button button--primary" onClick={onRetry}>
                  {tx("Tentar de novo")}
                </button>
                <button type="button" className="button button--secondary" onClick={onSignOut}>
                  {tx("Entrar com outra conta")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function VersionMark() {
  const { t } = useI18n();
  return <span className="version-mark" aria-label={t("common.version", { version: __APP_VERSION__ })}>v{__APP_VERSION__}</span>;
}

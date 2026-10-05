import { useEffect, useState } from "react";
import ParentIcon from "../../components/ParentIcon";
import ParentKidTabs from "../../components/ParentKidTabs";
import { formatCpf } from "../../cpf";
import { useI18n } from "../../i18n";
import { formatBrazilPhoneClient } from "../../phoneFormat";
import { roleMeta, sortRoles, type CoreRole, type LoggedUser } from "../../roles";
import { useParentHome, type MyKid } from "../../store/derive";
import { useCamperLive, usePersonData } from "../../hooks/usePersonData";
import styles from "../../styles/ops.module.scss";

interface ParentProfileProps {
  user: LoggedUser;
  /** the session token (live reads of the kids' details) */
  token: string;
  onLogout: () => void;
  loggingOut: boolean;
  /** switches the session to another profile the same person holds (mãe que também é da equipe) */
  onSwitchRole: (role: CoreRole) => Promise<void>;
}

/** A gentle note when IPAlpha keeps a kind of data away from this role. */
function InIpalphaNote() {
  const { tx } = useI18n();
  return <p className="cat-hint">{tx("Esses dados ficam no IPAlpha, em Meus dados.")}</p>;
}

/**
 * Emergency contact + documents of the kid, read from IPAlpha only when the
 * responsável asks (core's role rules decide; each read is logged for the
 * family — LGPD). Nothing is kept: leaving the page forgets them.
 */
function KidPersonData({ token, kidId }: { token: string; kidId: string }) {
  const { tx } = useI18n();
  const emergency = usePersonData(token, kidId, "emergencyContact");
  const doc = usePersonData(token, kidId, "document");
  const loading = emergency.loading || doc.loading;
  const ec = emergency.data;
  const d = doc.data;
  const rg = d && typeof d === "object" && typeof d.rg === "string" ? d.rg : "";
  const cpf = d && typeof d === "object" && typeof d.cpf === "string" ? d.cpf : typeof d === "string" ? d : "";
  if (loading) return <p className={`cat-hint ${styles.loading}`}>{tx("Carregando…")}</p>;
  if (emergency.error && doc.error) return <InIpalphaNote />;
  return (
    <div className={styles.reveal}>
      <dl className="detail-grid">
        <dt>{tx("Emergência")}</dt>
        <dd>
          {emergency.error ? (
            <em className="staff-card__missing">{tx("no IPAlpha, em Meus dados")}</em>
          ) : ec ? (
            [ec.name, ec.relation && `(${ec.relation})`, ec.phone && formatBrazilPhoneClient(ec.phone)].filter(Boolean).join(" ")
          ) : (
            "—"
          )}
        </dd>
        <dt>{tx("Documentos")}</dt>
        <dd>
          {doc.error ? (
            <em className="staff-card__missing">{tx("no IPAlpha, em Meus dados")}</em>
          ) : rg || cpf ? (
            [rg && tx("RG {n}", { n: rg }), cpf && tx("CPF {n}", { n: formatCpf(cpf) })].filter(Boolean).join(" · ")
          ) : (
            "—"
          )}
        </dd>
      </dl>
    </div>
  );
}

/** The emergency block of ONE kid — the family and the care data, read live from IPAlpha. */
function KidEmergency({ token, kid: { camper: k }, tabbed }: { token: string; kid: MyKid; tabbed: boolean }) {
  const { tx } = useI18n();
  const live = useCamperLive(token, k.id);
  const [asked, setAsked] = useState(false);
  const name = k.name || live.data?.name || "";
  const health = live.data?.health ?? null;
  const responsibles = live.data?.responsibles ?? [];
  return (
    <section
      id="parent-profile-kid-panel"
      role={tabbed ? "tabpanel" : undefined}
      aria-labelledby={tabbed ? `parent-profile-kid-tab-${k.id}` : undefined}
      className="detail-section"
    >
      <h2 className="detail-h2">{tx("🚨 Emergência · {name}", { name: name.split(" ")[0] || "…" })}</h2>
      <div className="detail-card">
        <dl className="detail-grid">
          <dt>{tx("Família")}</dt>
          <dd>
            {live.loading && !live.data ? (
              <span className={`cat-hint ${styles.loading}`}>{tx("Carregando…")}</span>
            ) : responsibles.length ? (
              responsibles.map((r) => r.name || "…").join(" · ")
            ) : (
              "—"
            )}
          </dd>
          <dt>{tx("Convênio")}</dt>
          <dd>
            {health?.insurance || "—"}
            {health?.insuranceCard && <span className="cat-hint">{tx("· carteirinha {n}", { n: health.insuranceCard })}</span>}
          </dd>
        </dl>
        {asked ? (
          <KidPersonData token={token} kidId={k.id} />
        ) : (
          <button type="button" className={`button button--secondary button--small ${styles.askButton}`} onClick={() => setAsked(true)}>
            {tx("Ver contato de emergência e documentos")}
          </button>
        )}
      </div>
      <p className="cat-hint">{tx("O contato de emergência e os documentos ficam no IPAlpha: você revisa em Meus dados. O convênio você edita em Início → Informações de saúde.")}</p>
    </section>
  );
}

/**
 * The parent's own page (header → their name): who they are, the roles they
 * hold, and — for the selected kid — the family and the care data read live
 * from IPAlpha (emergency contact / documents only on tap, when this role may
 * read them). With more than one kid the same tab strip as Início picks which
 * one is shown.
 */
export default function ParentProfile({ user, token, onLogout, loggingOut, onSwitchRole }: ParentProfileProps) {
  const { tx } = useI18n();
  const meta = roleMeta(user.activeRole);
  const data = useParentHome();
  const [selectedKidId, setSelectedKidId] = useState<string | null>(null);
  /** the same person may also be on the team / an admin — one tap enters that profile */
  const otherRoles = sortRoles(user.roles.filter((r) => r !== user.activeRole));
  const [switchingTo, setSwitchingTo] = useState<CoreRole | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  async function enterAs(role: CoreRole) {
    if (switchingTo) return;
    setSwitchingTo(role);
    setSwitchError(null);
    try {
      await onSwitchRole(role);
    } catch (err) {
      setSwitchError(err instanceof Error ? err.message : tx("Não foi possível trocar de perfil."));
      setSwitchingTo(null);
    }
  }

  useEffect(() => {
    if (!data?.kids.length) return;
    if (!selectedKidId || !data.kids.some((kid) => kid.camper.id === selectedKidId)) {
      setSelectedKidId(data.kids[0].camper.id);
    }
  }, [data, selectedKidId]);

  const kids = data?.kids ?? [];
  const selectedKid = kids.find((kid) => kid.camper.id === selectedKidId) ?? kids[0] ?? null;

  return (
    <div className="admin-page">
      <header className="admin-head">
        <h1 className="admin-title detail-title">
          <ParentIcon size={40} /> {user.name || tx("Perfil")}
        </h1>
      </header>
      <p className="admin-intro">{tx("Você entrou como {role}.", { role: tx(meta.label) })}</p>

      <section className="detail-card">
        <dl className="detail-grid">
          <dt>{tx("Perfil")}</dt>
          <dd>
            {/* the one they are already in: a plain label, nothing to tap */}
            <span className="role-chip role-chip--small role-chip--bare">
              <img className="role-chip__icon" src={meta.icon} alt="" aria-hidden="true" /> {tx(meta.label)}
            </span>
          </dd>
          {otherRoles.length > 0 && (
            <>
              <dt>{tx("Outros perfis")}</dt>
              <dd>
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
              </dd>
            </>
          )}
        </dl>
      </section>

      {switchError && <p className="message message--error">{switchError}</p>}

      <ParentKidTabs kids={kids} selectedId={selectedKid?.camper.id ?? ""} onSelect={setSelectedKidId} idPrefix="parent-profile-kid-tab" panelId="parent-profile-kid-panel" />

      {selectedKid && <KidEmergency key={selectedKid.camper.id} token={token} kid={selectedKid} tabbed={kids.length > 1} />}

      <div className="profile-actions">
        <button type="button" className="button button--danger profile-logout" onClick={onLogout} disabled={loggingOut}>
          {loggingOut ? tx("Saindo…") : tx("Sair do aplicativo")}
        </button>
      </div>
    </div>
  );
}

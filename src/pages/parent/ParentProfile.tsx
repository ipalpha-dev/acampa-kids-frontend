import { useEffect, useState } from "react";
import ParentIcon from "../../components/ParentIcon";
import ParentKidTabs from "../../components/ParentKidTabs";
import { formatCpf } from "../../cpf";
import { useI18n } from "../../i18n";
import { formatBrazilPhoneClient } from "../../phoneFormat";
import { roleMeta, sortRoles, type CoreRole, type LoggedUser } from "../../roles";
import { useParentHome, type MyKid } from "../../store/derive";

interface ParentProfileProps {
  user: LoggedUser;
  onLogout: () => void;
  loggingOut: boolean;
  /** switches the session to another profile the same person holds (mãe que também é da equipe) */
  onSwitchRole: (role: CoreRole) => Promise<void>;
}

/** The emergency block of ONE kid — what the registration form collected, read-only. */
function KidEmergency({ kid: { camper: k }, tabbed }: { kid: MyKid; tabbed: boolean }) {
  const { tx } = useI18n();
  return (
    <section
      id="parent-profile-kid-panel"
      role={tabbed ? "tabpanel" : undefined}
      aria-labelledby={tabbed ? `parent-profile-kid-tab-${k.id}` : undefined}
      className="detail-section"
    >
      <h2 className="detail-h2">{tx("🚨 Emergência · {name}", { name: k.name.split(" ")[0] })}</h2>
      <div className="detail-card">
        <dl className="detail-grid">
          <dt>{tx("Responsável")}</dt>
          <dd>{k.guardianName || "—"}</dd>
          <dt>{tx("Telefone")}</dt>
          <dd>{k.guardianPhone ? formatBrazilPhoneClient(k.guardianPhone) : "—"}</dd>
          {k.guardianEmail && (
            <>
              <dt>{tx("E-mail")}</dt>
              <dd>{k.guardianEmail}</dd>
            </>
          )}
          {k.guardianCpf && (
            <>
              <dt>{tx("CPF")}</dt>
              <dd>{formatCpf(k.guardianCpf)}</dd>
            </>
          )}
          <dt>{tx("Emergência")}</dt>
          <dd>{k.emergencyContact || "—"}</dd>
          <dt>{tx("Convênio")}</dt>
          <dd>
            {k.insurance || "—"}
            {k.insuranceCard && <span className="cat-hint">{tx("· carteirinha {n}", { n: k.insuranceCard })}</span>}
          </dd>
          {(k.rg || k.cpf) && (
            <>
              <dt>{tx("Documentos")}</dt>
              <dd>{[k.rg && tx("RG {n}", { n: k.rg }), k.cpf && tx("CPF {n}", { n: formatCpf(k.cpf) })].filter(Boolean).join(" · ")}</dd>
            </>
          )}
        </dl>
      </div>
      <p className="cat-hint">{tx("Para corrigir o contato de emergência ou os documentos, fale com a organização. O convênio você edita em Início → Informações de saúde.")}</p>
    </section>
  );
}

/**
 * The parent's own page (header → their name): who they are plus the
 * emergency data the registration form collected for the selected kid —
 * guardian, emergency contact, insurance, documents. With more than one kid
 * the same tab strip as Início picks which one is shown.
 */
export default function ParentProfile({ user, onLogout, loggingOut, onSwitchRole }: ParentProfileProps) {
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

      {selectedKid && <KidEmergency key={selectedKid.camper.id} kid={selectedKid} tabbed={kids.length > 1} />}

      <div className="profile-actions">
        <button type="button" className="button button--danger profile-logout" onClick={onLogout} disabled={loggingOut}>
          {loggingOut ? tx("Saindo…") : tx("Sair do aplicativo")}
        </button>
      </div>
    </div>
  );
}

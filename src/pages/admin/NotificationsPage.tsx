import { useState, type ReactNode } from "react";
import { updateSettings, welcomePreview, type NotificationSettings } from "../../api/settings";
import { namesFor } from "../../store/people";
import { useCollection } from "../../store";
import { useConfirm } from "../../components/ConfirmDialog";
import Dialog from "../../components/Dialog";
import Toggle from "../../components/Toggle";
import { useRoute } from "../../router";
import { ICONS } from "../../icons";
import CheckinReminderCard from "./CheckinReminderCard";
import PageFooter from "../../components/PageFooter";
import { useI18n } from "../../i18n";

interface NotificationsPageProps {
  token: string;
}

const BUS_SMS_EXAMPLE = "AcampaKids: Marcela, a Ana está a caminho de um fim de semana incrível para aprender sobre Jesus! Aproveite o fim de semana livre: vamos cuidar muito bem dela.";
const BIRTHDAY_SMS_EXAMPLE = "AcampaKids: João, hoje é aniversário da Ana, do quarto 103! 🎂 Vamos fazer o dia dela especial.";
const PARENT_WELCOME_EXAMPLE = "AcampaKids: Marcela, a Ana está inscrita no Acampa Kids! Acompanhe tudo pelo app. Entre com o celular (11) 99999-9999 em <link do app>";
const PHOTOS_SMS_EXAMPLE = "AcampaKids: Marcela, as fotos do acampamento já estão no app \u{1F4F7}. <link do app>";

type NotifKey = Exclude<keyof NotificationSettings, "checkinReminder">;
type Tx = (pt: string, vars?: Record<string, string | number>) => string;

interface NotifOption {
  key: NotifKey;
  emoji?: string;
  icon?: string;
  pairIcon?: string;
  title: string;
  text: ReactNode;
  welcome?: "staff" | "parents";
}

interface NotifGroup {
  id: string;
  title: string;
  icon?: string;
  emoji?: string;
  hint: string;
  options: NotifOption[];
  reminder?: boolean;
}

function buildGroups(tx: Tx): NotifGroup[] {
  return [
    {
      id: "staff",
      title: tx("Para a equipe"),
      icon: ICONS.staff,
      hint: tx("SMS para quem está no cadastro da equipe."),
      reminder: true,
      options: [
        {
          key: "enrolments",
          icon: ICONS.staff,
          title: tx("Boas-vindas da equipe"),
          text: tx("Quando o app é liberado para a equipe (início do período de acesso) cada pessoa recebe, uma única vez, um SMS de boas-vindas com o link do app. Os papéis de cada pessoa (organização, saúde, check-in…) são definidos no IPAlpha."),
          welcome: "staff",
        },
        {
          key: "staffChanges",
          icon: ICONS.staff,
          title: tx("Mudança no cadastro da equipe"),
          text: tx("Quando o quarto, a função no quarto (líder ↔ auxiliar), o time ou o transporte de alguém da equipe é alterado, a própria pessoa recebe um SMS."),
        },
        {
          key: "bedroomChanges",
          icon: ICONS.bunk,
          title: tx("Mudança de criança sob responsabilidade"),
          text: tx("Quando uma criança passa a ser (ou deixa de ser) responsabilidade de alguem, só o líder envolvido recebe um SMS — auxiliares não são avisados."),
        },
        {
          key: "roleChanges",
          emoji: "🎯",
          title: tx("Mudança de função na programação"),
          text: tx("Quando alguém é escalado, trocado ou retirado de uma função — ou o evento muda de horário / é cancelado — a pessoa recebe um SMS."),
        },
        {
          key: "contentChanges",
          emoji: "📖",
          pairIcon: ICONS.preparation,
          title: tx("Instruções ou Preparação novas / alteradas"),
          text: tx("Quando um documento de Instruções ou uma seção da Preparação é criado ou alterado (a equipe para quem foi publicado), ou as instruções / preparação de uma função mudam (quem tem a função), a pessoa recebe um SMS."),
        },
        {
          key: "checkinConfirmation",
          emoji: "✅",
          title: tx("Confirmação de check-in da equipe"),
          text: tx("Quando o check-in de alguém da equipe é registrado na igreja ela recebe um SMS confirmando e lembrando de conferir as crianças do seu quarto."),
        },
        {
          key: "birthdays",
          emoji: "🎂",
          title: tx("Aniversário de criança no acampamento"),
          text: (
            <>
              {tx("Quando uma criança faz aniversário num dia do acampamento, toda a equipe do quarto dela recebe um SMS às")}{" "}
              <strong>07:45</strong>{" "}
              {tx("desse dia:")}
              <br />
              <code className="sms-example">{tx(BIRTHDAY_SMS_EXAMPLE)}</code>
            </>
          ),
        },
        {
          key: "parentEdits",
          icon: ICONS.health,
          title: tx("A família alterou os pontos de atenção"),
          text: tx("Quando um responsável altera as informações de saúde da criança (alergias, medicação, convênio…), a equipe de cuidado, a coordenação e o líder do quarto recebem um SMS. Se mudar só as observações, apenas o líder do quarto é avisado."),
        },
        {
          key: "occurrences",
          emoji: "📋",
          title: tx("Ocorrência registrada"),
          text: tx("Quando uma ocorrência é registrada (pela organização ou pela equipe de cuidado), a coordenação recebe um SMS — a não ser que tenha sido quem registrou."),
        },
      ],
    },
    {
      id: "parents",
      title: tx("Para os pais"),
      icon: ICONS.parent,
      hint: tx("SMS para responsáveis — só enquanto a janela de acesso dos pais estiver aberta, quando fizer sentido."),
      options: [
        {
          key: "parentWelcome",
          icon: ICONS.parent,
          title: tx("Boas-vindas aos pais"),
          text: (
            <>
              {tx("Quando o app é liberado para os pais (janela de acesso dos pais, em Geral) cada responsável recebe,")}{" "}
              <strong>{tx("uma única vez")}</strong>
              {tx(", um SMS avisando que a criança está inscrita e como entrar no app.")}
              <br />
              <code className="sms-example">{tx(PARENT_WELCOME_EXAMPLE)}</code>
            </>
          ),
          welcome: "parents",
        },
        {
          key: "parentContentChanges",
          icon: ICONS.preparation,
          title: tx("Preparação nova / alterada para os pais"),
          text: tx("Quando uma seção da Preparação publicada para os pais é criada ou alterada, cada responsável recebe um SMS — só enquanto a janela de acesso dos pais (em Geral) estiver aberta."),
        },
        {
          key: "busCheckin",
          icon: ICONS.transport,
          title: tx("Criança embarcou no ônibus"),
          text: (
            <>
              {tx('Quando o check-in da criança no ônibus é registrado, o responsável recebe este SMS (com o nome da criança e "dele" / "dela" conforme o cadastro):')}
              <br />
              <code className="sms-example">{tx(BUS_SMS_EXAMPLE)}</code>
            </>
          ),
        },
      ],
    },
    {
      id: "everyone",
      title: tx("Para todos"),
      icon: ICONS.camera,
      hint: tx("SMS para a equipe e para os responsáveis."),
      options: [
        {
          key: "photoPublishes",
          icon: ICONS.camera,
          title: tx("Fotos publicadas"),
          text: (
            <>
              {tx("Quando quem serve na fotografia liga")}{" "}
              <strong>{tx("Publicadas")}</strong>{" "}
              {tx("na aba Fotos, a equipe e os responsáveis recebem um SMS avisando —")}{" "}
              <strong>{tx("uma única vez por acampamento")}</strong>
              {tx(". Publicar mais fotos depois não manda SMS de novo, e esconder as fotos não avisa ninguém. Desligar e ligar este aviso libera um novo envio para todos.")}
              <br />
              <code className="sms-example">{tx(PHOTOS_SMS_EXAMPLE)}</code>
            </>
          ),
        },
      ],
    },
  ];
}

export default function NotificationsPage({ token }: NotificationsPageProps) {
  const { tx } = useI18n();
  const settings = useCollection("settings");
  const { navigate } = useRoute();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<keyof NotificationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const groups = buildGroups(tx);

  async function toggle(key: keyof NotificationSettings, value: boolean, welcome?: "staff" | "parents") {
    if (!settings || busy) return;
    setBusy(key);
    setError(null);
    try {
      if (value && welcome) {
        const preview = (await welcomePreview(token))[welcome];
        const who = welcome === "staff" ? tx("pessoas da equipe") : tx("responsáveis");
        const shown = await namesFor(preview.personIds.slice(0, 8));
        const names = shown.join(", ") + (preview.personIds.length > 8 ? tx(" e mais {n}", { n: preview.personIds.length - 8 }) : "");
        const ok = await confirm({
          emoji: "📲",
          title: preview.count > 0 ? tx("Enviar SMS para {count} {who} agora?", { count: preview.count, who }) : tx("Ligar boas-vindas?"),
          message:
            preview.count > 0 ? (
              <>
                <p>
                  {tx("Ao ligar,")}{" "}
                  <strong>
                    {preview.count} {who}
                  </strong>{" "}
                  {tx("que ainda não receberam as boas-vindas e já estão dentro da janela de acesso recebem o SMS")}{" "}
                  <strong>{tx("imediatamente")}</strong>:
                </p>
                <p className="cat-hint">{names}</p>
              </>
            ) : (
              <p>
                {preview.windowOpen
                  ? tx("Ninguém recebe agora: todos os {who} dentro da janela já foram avisados.", { who })
                  : tx("Ninguém recebe agora — a janela de acesso {window} está fechada. O SMS sai quando ela abrir, para quem ainda não recebeu.", {
                      window: welcome === "staff" ? tx("da equipe") : tx("dos pais"),
                    })}
              </p>
            ),
          confirmLabel: preview.count > 0 ? tx("Enviar para {count}", { count: preview.count }) : tx("Ligar"),
        });
        if (!ok) return;
      }
      await updateSettings(token, { notifications: { [key]: value } });
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("Algo deu errado."));
    } finally {
      setBusy(null);
    }
  }

  if (!settings && !error) {
    return (
      <div className="admin-page">
        <p className="opt-empty">{tx("Carregando configurações… ⚙️")}</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-head">
        <h1 className="admin-title">
          <img className="admin-title__icon" src={ICONS.notifications} alt="" aria-hidden="true" />
          {tx("Notificações")}
        </h1>
      </header>
      <p className="admin-intro">{tx("Quem precisa recebe um SMS. Quando há e-mail, o detalhe vai por e-mail.")}</p>

      {settings && settings.staffAccessWindow && !settings.staffAccessWindow.open && (
        <p className="message message--warn">
          {tx("A equipe está sem acesso ao sistema, então não recebe notificações.")}{" "}
          <a
            href="#/general"
            onClick={(e) => {
              e.preventDefault();
              navigate("/general");
            }}
          >
            {tx("Ajustar período de acesso")}
          </a>
        </p>
      )}
      {settings?.kidsRoomsDraft && (
        <p className="message message--warn">
          {tx("Os quartos das crianças estão em rascunho: os avisos de quarto (crianças e equipe) estão pausados.")}{" "}
          <a
            href="#/trials"
            onClick={(e) => {
              e.preventDefault();
              navigate("/trials");
            }}
          >
            {tx("Ajustar em Testes")}
          </a>
        </p>
      )}
      {error && <p className="message message--error">{error}</p>}

      {settings &&
        groups.map((g) => (
          <section key={g.id} className="notif-group" aria-labelledby={`notif-${g.id}`}>
            <header className="notif-group__head">
              <span className="notif-group__mark" aria-hidden="true">
                {g.icon ? <img src={g.icon} alt="" className="notif-group__icon" /> : g.emoji}
              </span>
              <div>
                <h2 id={`notif-${g.id}`} className="notif-group__title">
                  {g.title}
                </h2>
                <p className="notif-group__hint">{g.hint}</p>
              </div>
            </header>
            <ul className="notif-list">
              {g.options.map((o) => {
                const on = settings.notifications[o.key];
                return (
                  <li key={o.key} className={`notif-item ${on ? "notif-item--on" : ""}`}>
                    <span className={`notif-item__emoji ${o.pairIcon ? "notif-item__emoji--pair" : ""}`} aria-hidden="true">
                      {o.pairIcon ? (
                        <>
                          <span>{o.emoji}</span>
                          <i className="notif-item__plus">+</i>
                          <img src={o.pairIcon} alt="" className="notif-item__icon" />
                        </>
                      ) : o.icon ? (
                        <img src={o.icon} alt="" className="notif-item__icon" />
                      ) : (
                        o.emoji
                      )}
                    </span>
                    <div className="notif-item__body">
                      <h3 className="notif-item__title">{o.title}</h3>
                      <p className="notif-item__text">{o.text}</p>
                    </div>
                    <Toggle checked={on} disabled={busy !== null} label={on ? tx("Ligado") : tx("Desligado")} onChange={(v) => toggle(o.key, v, o.welcome)} />
                  </li>
                );
              })}
            </ul>
            {g.reminder && <CheckinReminderCard token={token} />}
          </section>
        ))}

      <PageFooter>
        {tx('Só recebe SMS quem tem celular no IPAlpha. O e-mail equivalente sai só para quem tem endereço. Os pais só recebem o que está em “Para os pais” (e as fotos publicadas) — nunca avisos de quarto, função ou cadastro da equipe.')}
      </PageFooter>
    </div>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

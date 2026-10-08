import { ApiError } from "../api/client";
import { LITERALS } from "./literals";
import { format, type Locale } from "./locales";

/**
 * What the person reads when something fails — always in their language.
 *
 * The backend answers `{error: {code, message}}` with a pt-BR message. Shown
 * as is in pt-BR (it is the most specific text); in the other languages the
 * text comes, in order, from:
 *   1. the error CODE (`BY_CODE` — one gentle text per code, 5 languages);
 *   2. the message itself when the catalog knows it (a translated pass-through);
 *   3. the code's family (`…_NOT_FOUND`, `…_INVALID`, `…_FORBIDDEN`…);
 *   4. the screen's own fallback, else the generic "Algo deu errado".
 * Errors raised in the app itself (`new Error(tx(…))`) are already in the
 * person's language: shown as is, translated when the catalog knows them.
 */

export const GENERIC_ERROR = "Algo deu errado. Tente novamente.";

/** Codes whose server text is technical: never shown, even in pt-BR. */
const TECHNICAL = new Set(["INTERNAL", "INVALID_JSON", "BODY_INVALID", "PAYLOAD_TOO_LARGE", "CURSOR_INVALID", "UNKNOWN", "SNAPSHOT_FAILED"]);

/** pt-BR source text per code (translations in ./pending/errors.ts); `{n}` / `{year}` come from the error's own numbers. */
const BY_CODE: Record<string, string> = {
  OFFLINE: "Sem conexão com o servidor. Verifique o Wi-Fi do acampamento e tente novamente.",
  UNAUTHORIZED: "Sua sessão terminou. Entre de novo.",
  SESSION_ENDED: "Sua sessão terminou. Entre de novo.",
  IPALPHA_UNAVAILABLE: "O IPAlpha está em manutenção agora. Tente de novo daqui a pouco.",
  INTERNAL: GENERIC_ERROR,
  UNKNOWN: GENERIC_ERROR,
  INVALID_JSON: GENERIC_ERROR,
  BODY_INVALID: GENERIC_ERROR,
  CURSOR_INVALID: GENERIC_ERROR,
  SNAPSHOT_FAILED: GENERIC_ERROR,
  PAYLOAD_TOO_LARGE: "Isso ficou grande demais para enviar de uma vez.",
  STARTING: "O acampamento está abrindo. Tente de novo em instantes.",
  CAMP_ARCHIVED: "Este ano está arquivado — só leitura.",
  CAMP_FORBIDDEN: "Você não tem acesso a esse ano.",
  ROLE_FORBIDDEN: "Este perfil não está mais disponível para você.",
  CORE_FORBIDDEN: "O IPAlpha não permitiu isso para o seu perfil. Nada foi alterado.",
  CORE_REJECTED: "O IPAlpha não aceitou isso agora. Nada foi alterado.",
  COORDINATION_REQUIRED: "Só quem serve na coordenação pode fazer isso.",
  SUPER_ADMIN_ONLY: "Só o administrador da implantação pode fazer isso.",
  STAFF_ACCESS_ENDED: "O acampamento já terminou. Esperamos você no ano que vem!",
  NOT_IN_PROJECT: "Você ainda não faz parte deste acampamento no IPAlpha.",
  PHONE_INVALID: "Digite um celular válido com DDD (ex.: (11) 98123-4567).",
  OTP_INVALID: "Código incorreto.",
  OTP_INVALID_FORMAT: "Digite os números do código.",
  OTP_EXPIRED: "O código expirou. Peça um novo código.",
  OTP_COOLDOWN: "Aguarde {n} s para pedir um novo código.",
  ACCOUNT_FROZEN: "Muitas tentativas incorretas. Tente de novo em {n} minuto(s).",
  SMS_SEND_FAILED: "Não foi possível enviar o código agora. Tente de novo em instantes.",
  CAMPER_NOT_FOUND: "Não encontramos esta criança neste acampamento.",
  PERSON_NOT_FOUND: "Pessoa não encontrada.",
  CHECKIN_WINDOW_CLOSED: "O check-in não está liberado para você neste momento.",
  ALREADY_CHECKED_IN: "O check-in já tinha sido feito.",
  NOT_CHECKED_IN: "O check-in ainda não foi feito.",
  CHURCH_CHECKIN_REQUIRED: "Esta criança ainda não fez o check-in na igreja.",
  OUTBOUND_BUS_CHECKIN_REQUIRED: "Esta criança não fez o check-in do ônibus na ida.",
  NOT_TODAY: "O check-in só abre no dia da saída.",
  NOT_YET: "O check-in ainda não abriu.",
  TOO_FAR: "Você ainda está longe do ponto de encontro. Chegue mais perto para fazer o check-in.",
  LOCATION_REQUIRED: "Não foi possível ler a sua localização. Ative o GPS e tente de novo.",
  CAMP_NOT_ACTIVE: "A leitura de crachás só funciona durante o acampamento.",
  SCORE_CLOSED: "O placar só recebe pontos nos dias do acampamento.",
  ALREADY_SCANNED: "Este crachá já foi lido neste evento.",
  LOOKUP_BLOCKED: "Você já leu várias crianças que não são do seu quarto. Peça à organização para liberar o acesso.",
  BEDROOM_FULL: "Este quarto não tem lugar para todos.",
  STAFF_NOT_LINKED: "Você não está na equipe deste acampamento.",
  NOT_LINKED: "Você não está na equipe deste acampamento.",
  INACTIVE: "Seu cadastro na equipe está inativo.",
  ALREADY_IN_CAMP: "Esta pessoa já está neste acampamento.",
  NOT_IN_EDITION: "Esta pessoa ainda não está nesta edição no IPAlpha.",
  EDITION_MISSING: "Ainda não encontramos a edição {year} no Oikos. Peça com carinho à coordenação do projeto para criá-la por lá e tente de novo.",
  REGISTRATION_FAILED: "O IPAlpha não confirmou o cadastro.",
  FILE_TOO_LARGE: "O arquivo é grande demais.",
  FILE_TYPE: "Use uma imagem JPG, PNG, WebP ou GIF.",
  FACE_NOT_FOUND: "Não encontrei um rosto nítido nessa foto.",
  MULTIPLE_FACES: "Use uma foto com apenas uma pessoa.",
  FACE_SEARCH_UNAVAILABLE: "A busca por rosto está indisponível no momento.",
  AI_DISABLED: "O assistente não está disponível agora.",
  AI_UPSTREAM: "O assistente não respondeu. Tente de novo.",
  NO_SCHEDULE: "A programação ainda não foi cadastrada.",
  NOTHING_TO_UPDATE: "Nada para atualizar.",
  EMPTY: "Nada para aplicar.",
};

/** Code families, for the codes `BY_CODE` does not name (checked in order). */
const FAMILIES: [RegExp, string][] = [
  [/(^|_)NOT_FOUND$/, "Não encontramos o que você procurava. Talvez tenha sido removido."],
  [/FORBIDDEN$|_ONLY$|_REQUIRED$/, "Você não tem permissão para fazer isso."],
  [/_DUPLICATE$|_EXISTS$|_CONFLICT$|_IN_USE$|^ALREADY_/, "Isso já existe ou acabou de mudar. Atualize e tente de novo."],
  [/_INVALID$|^INVALID_|_MISSING$|_UNKNOWN$|_TOO_MANY$|_EMPTY$/, "Algum dado não está certo. Confira e tente de novo."],
  [/^AI_|^AUDIO_/, "O assistente não respondeu. Tente de novo."],
  [/^FILE_|UPLOAD|^ZIP_|^THUMB_/, "Não foi possível enviar o arquivo. Tente de novo."],
  [/^IPALPHA_|^CORE_/, "O IPAlpha não respondeu como esperado. Tente de novo daqui a pouco."],
];

/** A server `{code, message}` (an ApiError, or a refusal object like the self check-in's `reason`). */
interface CodedError {
  code: string;
  message: string;
  attemptsLeft?: number;
  minutesLeft?: number;
  secondsLeft?: number;
  year?: number;
}

function coded(err: unknown): CodedError | null {
  if (err instanceof ApiError) return err;
  if (err && typeof err === "object" && !(err instanceof Error) && typeof (err as CodedError).code === "string") {
    const o = err as Partial<CodedError>;
    return { code: o.code!, message: typeof o.message === "string" ? o.message : "" };
  }
  return null;
}

function translate(locale: Locale, pt: string, vars?: Record<string, string | number>): string {
  return format(locale === "pt" ? pt : (LITERALS[pt]?.[locale] ?? pt), vars ?? {});
}

function numbersOf(err: CodedError): Record<string, number> {
  const n = err.minutesLeft ?? err.secondsLeft ?? err.attemptsLeft;
  return { ...(typeof n === "number" ? { n } : {}), ...(typeof err.year === "number" ? { year: err.year } : {}) };
}

/** The text of the error's code (exact, then family), or null. */
function codeText(locale: Locale, err: CodedError): string | null {
  const exact = BY_CODE[err.code];
  if (exact) {
    const vars = numbersOf(err);
    // a {n} / {year} the error did not carry: the gentle generic of that code instead of a stray placeholder
    if ((exact.includes("{n}") && vars.n === undefined) || (exact.includes("{year}") && vars.year === undefined)) return null;
    return translate(locale, exact, vars);
  }
  return null;
}

function familyText(locale: Locale, code: string): string | null {
  for (const [re, pt] of FAMILIES) if (re.test(code)) return translate(locale, pt);
  return null;
}

/** The error, in the person's language (see the module comment for the order). */
export function errorText(locale: Locale, err: unknown, fallbackPt: string = GENERIC_ERROR): string {
  const c = coded(err);
  if (c) {
    if (locale === "pt" && c.message && !TECHNICAL.has(c.code)) return c.message;
    return codeText(locale, c) ?? (LITERALS[c.message]?.[locale as Exclude<Locale, "pt">] ? translate(locale, c.message) : null) ?? familyText(locale, c.code) ?? translate(locale, fallbackPt);
  }
  if (err instanceof Error && err.message) return translate(locale, err.message);
  return translate(locale, fallbackPt);
}

/** Tests / catalog checks: every pt-BR text this module may show. */
export const ERROR_TEXTS: readonly string[] = [GENERIC_ERROR, ...new Set(Object.values(BY_CODE)), ...FAMILIES.map(([, pt]) => pt)];

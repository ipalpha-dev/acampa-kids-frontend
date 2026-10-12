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
  SCHEDULE_FORBIDDEN: "Só quem coordena o acampamento pode alterar a programação. Nada foi alterado.",
  SCHEDULE_UNAVAILABLE: "A agenda do IPAlpha não respondeu agora. Nada foi alterado — tente de novo em instantes.",
  SCHEDULE_REJECTED: "A agenda do IPAlpha não aceitou este momento. Confira o horário, os perfis e os locais.",
  SCHEDULE_ENTRY_NOT_FOUND: "Este momento não existe mais na agenda do IPAlpha.",
  SCHEDULE_CONFLICT: "A agenda mudou enquanto você editava. Tente de novo.",
  CONSENTS_UNAVAILABLE: "A autorização do acampamento não pôde ser carregada agora. Tente de novo daqui a pouco.",
  CONSENT_VERSION_CHANGED: "O texto da autorização foi atualizado. Leia a nova versão, por favor.",
  CONSENT_NOT_REQUIRED: "Esta autorização não é mais pedida neste acampamento.",
  CONSENT_FORBIDDEN: "Por aqui você autoriza só pelas crianças sob seus cuidados neste acampamento.",
  CONSENT_INVALID: "Confira o que foi mostrado e tente de novo.",
  RESPONSIBLE_REQUIRED: "Só os responsáveis pelas crianças podem fazer isso.",
  VENUE_REQUIRED: "Escolha primeiro o local do acampamento.",
  VENUE_INVALID: "Escolha um local de acampamento do cadastro da igreja.",
  VENUE_HAS_ROOMS: "Este acampamento já tem quartos de outro local. Tire os quartos (Configurações → Limpeza) antes de trocar o local.",
  OUTSIDE_CAMP_VENUE: "Por aqui só dá para mudar os locais do acampamento. Para os demais locais, fale com a secretaria da igreja. Nada foi alterado.",
  PLACES_FORBIDDEN: "Só quem coordena o acampamento pode alterar os locais. Nada foi alterado.",
  ROLE_NOT_HELD: "Seu perfil de coordenação não está mais ativo neste projeto. Entre de novo para continuar. Nada foi alterado.",
  PLACES_UNAVAILABLE: "O cadastro de locais está descansando um instante. Nada foi alterado — tente de novo daqui a pouco.",
  PLACE_REJECTED: "O cadastro de locais não aceitou este quarto. Confira o nome e as camas.",
  PLACE_NOT_FOUND: "Este local não existe mais no cadastro da igreja.",
  PLACE_INVALID: "Escolha um local dentro do local do acampamento.",
  ROOM_ALREADY_LINKED: "Este quarto já faz parte do acampamento.",
  PLACE_MISSING: "Este quarto não existe mais no cadastro de locais. Remova-o do acampamento.",
  PLACES_INVALID: "Escolha locais do local do acampamento.",
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
  // the camp album (photos-api through Acampa)
  PHOTOS_NOT_UPLOADER: "Só quem cuida das fotos (fotografia ou coordenação) pode enviar ou organizar o álbum. Nada foi alterado.",
  PHOTOS_APP_MISMATCH: "O álbum deste ano ainda não está liberado para o Acampa no IPAlpha. Fale com a secretaria da igreja.",
  PHOTOS_FORBIDDEN: "O IPAlpha não permitiu isso para o seu perfil. Nada foi alterado.",
  PHOTOS_NOT_FOUND: "Esta foto não está mais no álbum.",
  ALBUM_GONE: "O álbum deste acampamento não existe mais no IPAlpha. Crie um novo álbum para continuar.",
  ALBUM_EXISTS: "Este acampamento já tem um álbum.",
  ALBUM_NOT_READABLE: "Publique o álbum para organizar as fotos por aqui.",
  ALBUM_MISSING: "Crie o álbum do acampamento primeiro.",
  ALBUM_DATES_INVALID: "Escolha o primeiro e o último dia do acampamento.",
  EDITION_UNKNOWN: "A edição deste acampamento ainda não existe no IPAlpha.",
  PHOTO_INVALID: "Uma das fotos não pôde ser aberta. Nada deste lote foi enviado — tente sem ela.",
  PHOTO_TOO_LARGE: "Uma das fotos é grande demais (máx. 25 MB por foto).",
  PHOTOS_BATCH_INVALID: "Envie até 50 fotos por vez.",
  EVENT_HAS_PHOTOS: "Este momento ainda tem fotos. Mova as fotos antes de tirá-lo do álbum.",
  EVENT_LINK_INVALID: "Não deu para ligar este momento da programação ao álbum. Confira se ele tem horário de término.",
  EVENT_NAME_INVALID: "Dê um nome ao momento (até 120 caracteres).",
  PHOTOS_REJECTED: "O álbum do IPAlpha não aceitou isso agora. Nada foi alterado.",
  PHOTOS_UNAVAILABLE: "O álbum de fotos está descansando um instante. Tente de novo daqui a pouco.",
  NOT_YOUR_CHILD: "Por aqui você vê as fotos das crianças que estão sob seus cuidados.",
  FIND_KID_UNAVAILABLE: "Não conseguimos procurar as fotos agora. Tente de novo daqui a pouco.",
  AI_DISABLED: "O assistente não está disponível agora.",
  AI_UPSTREAM: "O assistente não respondeu. Tente de novo.",
  AI_NOT_APPROVED: "Este recurso de IA não está disponível para este acesso no momento.",
  AI_SIGN_IN_AGAIN: "Para continuar usando a IA, saia e entre de novo no Acampa.",
  AI_FORBIDDEN: "Este recurso de IA não está disponível para o seu perfil.",
  AI_CAP: "O uso de IA do Acampa chegou ao limite deste mês. Ele se renova no começo do próximo mês.",
  AI_LIVE_CAP: "A conversa por voz já foi bastante usada hoje. Amanhã ela volta a ficar disponível.",
  AI_BUSY: "O assistente está um pouco ocupado agora. Aguarde um instante e tente de novo.",
  AI_IMAGES: "O assistente ainda não lê imagens no chat. Cole o texto ou descreva o que está na imagem.",
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

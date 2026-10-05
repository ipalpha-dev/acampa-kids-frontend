import { ICONS } from "./icons";

/**
 * IPAlpha project roles (CONTRACTS_ACAMPA §10). Roles live in projects-api,
 * one per edition (plus the project-wide `coordenacao`); a person signs in
 * once and the session keeps every role they hold — switching is one tap, no
 * new SMS. A future helper is just a new key: unknown keys behave like
 * `equipe` everywhere in this app.
 */
export const CORE_ROLES = [
  "coordenacao",
  "organizacao",
  "organizacao-jogos",
  "pontuacao",
  "saude",
  "coletes",
  "fotografia",
  "checkin",
  "checkin-onibus",
  "equipe",
  "responsavel",
] as const;
export type KnownCoreRole = (typeof CORE_ROLES)[number];
/** A §10 role key — the known ones, or a future helper key (treated as `equipe`). */
export type CoreRole = KnownCoreRole | (string & {});

/** What the camp-ops screens are built for: coordenação, any team / helper role, or a responsável. */
export type Audience = "admin" | "staff" | "parent";

export function audienceOf(role: CoreRole): Audience {
  if (role === "coordenacao") return "admin";
  if (role === "responsavel") return "parent";
  return "staff";
}

export interface RoleMeta {
  key: CoreRole;
  /** gentle label (pt-BR source; translated with `tx`) — roles describe how someone serves, never a rank */
  label: string;
  description: string;
  /** paper-cut style icon matching the poster */
  icon: string;
  color: "orange" | "green" | "red" | "purple";
}

const META: Record<KnownCoreRole, Omit<RoleMeta, "key">> = {
  coordenacao: { label: "Coordenação", description: "Cuida de todo o acampamento", icon: ICONS.admin, color: "purple" },
  organizacao: { label: "Organização", description: "Ajuda a coordenar o acampamento", icon: ICONS.organizer, color: "purple" },
  "organizacao-jogos": { label: "Organização dos jogos", description: "Programação e placar das brincadeiras", icon: ICONS.team, color: "green" },
  pontuacao: { label: "Pontuação", description: "Registra os pontos das brincadeiras", icon: ICONS.badge, color: "green" },
  saude: { label: "Equipe de cuidado", description: "Saúde e bem-estar de todos", icon: ICONS.health, color: "red" },
  coletes: { label: "Coletes", description: "Entrega e recolhe os coletes da equipe", icon: ICONS.vest, color: "green" },
  fotografia: { label: "Fotografia", description: "Guarda os momentos do acampamento", icon: ICONS.camera, color: "green" },
  checkin: { label: "Check-in na igreja", description: "Recebe as famílias na chegada", icon: ICONS.handshake, color: "green" },
  "checkin-onibus": { label: "Check-in do ônibus", description: "Confere quem embarca", icon: ICONS.transport, color: "green" },
  equipe: { label: "Equipe", description: "Quem serve nos quartos e atividades", icon: ICONS.staff, color: "green" },
  responsavel: { label: "Responsável", description: "Acompanhe sua criança na aventura!", icon: ICONS.parent, color: "orange" },
};

export function isKnownRole(role: string): role is KnownCoreRole {
  return (CORE_ROLES as readonly string[]).includes(role);
}

/** Metadata of any role key; a future helper key reads as a team role. */
export function roleMeta(role: CoreRole): RoleMeta {
  return { key: role, ...(isKnownRole(role) ? META[role] : META.equipe) };
}

/** Most capable first (same order as the backend's landing rank); unknown keys sit with `equipe`. */
export function sortRoles(roles: readonly CoreRole[]): CoreRole[] {
  const rank = (r: CoreRole) => {
    const i = (CORE_ROLES as readonly string[]).indexOf(r);
    return i === -1 ? CORE_ROLES.indexOf("equipe") : i;
  };
  return [...roles].sort((a, b) => rank(a) - rank(b));
}

/** Shape returned by the backend after login / `GET /api/auth/me` (no phone, no locale — person data stays in core). */
export interface LoggedUser {
  /** the IPAlpha person id (same as `personId`) */
  id: string;
  personId: string;
  /** read live from core; empty when core could not answer at that moment */
  name: string;
  /** every role this person holds in the camp's edition (+ project-wide) */
  roles: CoreRole[];
  /** the role this session acts as */
  activeRole: CoreRole;
  /** what the camp-ops screens are built for (a history session reads as `admin`) */
  audience: Audience;
  /** deployment owner (SUPER_ADMIN_PERSON_IDS) */
  superAdmin: boolean;
}

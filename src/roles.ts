import { ICONS } from "./icons";

export const ROLES = ["parent", "staff", "health_staff", "admin"] as const;
export type Role = (typeof ROLES)[number];

export interface RoleMeta {
  key: Role;
  label: string;
  /** how to call ONE person with this role ("Você entrou como …") */
  personLabel: string;
  description: string;
  /** paper-cut style icon matching the poster */
  icon: string;
  color: string;
}

export const ROLE_LIST: RoleMeta[] = [
  {
    key: "parent",
    label: "Pais & Responsáveis",
    personLabel: "Responsável",
    description: "Acompanhe seu filho na aventura!",
    icon: ICONS.parent,
    color: "orange",
  },
  {
    key: "staff",
    label: "Equipe",
    personLabel: "Membro do Staff",
    description: "Monitores e organização do acampamento",
    icon: ICONS.staff,
    color: "green",
  },
  {
    key: "health_staff",
    label: "Equipe de Saúde",
    personLabel: "Membro da Equipe de Saúde",
    description: "Cuidando de todos os aventureiros",
    icon: ICONS.health,
    color: "red",
  },
  {
    key: "admin",
    label: "Administração",
    personLabel: "Administrador",
    description: "Gestão completa do acampamento",
    icon: ICONS.admin,
    color: "purple",
  },
];

export function roleMeta(role: Role): RoleMeta {
  return ROLE_LIST.find((r) => r.key === role) ?? ROLE_LIST[0];
}

/** Shape returned by the backend after login / /me */
export interface LoggedUser {
  id: string;
  name: string;
  phone: string;
  /** every role this person holds (parent + staff + admin …) */
  roles: Role[];
  /** the role picked at login — what this session acts as */
  activeRole: Role;
  /** last device language saved at login — UI + SMS follow this */
  locale?: "pt" | "en" | "es" | "fr" | "de";
}

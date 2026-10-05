import { api } from "./client";
import { bearer } from "../auth/store";

/** One person holding `coordenacao` (names read live; the role itself is granted in Mordomia). */
export interface AdminAccount {
  personId: string;
  name: string;
  /** a deployment owner (SUPER_ADMIN_PERSON_IDS) */
  superAdmin: boolean;
}

export interface AdminsInfo {
  admins: AdminAccount[];
  /** public URL of the app (empty when APP_URL is not configured) */
  appUrl: string;
}

/** Everyone who coordinates the camp + the app link. Read-only: roles are granted in Mordomia (IPAlpha). */
export async function listAdmins(token: string): Promise<AdminsInfo> {
  return api<AdminsInfo>("/api/admins", { headers: bearer(token) });
}

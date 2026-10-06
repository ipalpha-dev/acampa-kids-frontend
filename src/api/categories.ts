import { command } from "./client";
import { bearer } from "../auth/store";
import { ICONS } from "../icons";

export const CATEGORY_AUDIENCES = ["camper", "staff"] as const;
export type CategoryAudience = (typeof CATEGORY_AUDIENCES)[number];

export const CATEGORY_SELECTIONS = ["single", "multiple"] as const;
export type CategorySelection = (typeof CATEGORY_SELECTIONS)[number];

/** `icon` is a paper-cut image (same set as the login page). */
export const AUDIENCE_META: Record<CategoryAudience, { label: string; icon?: string }> = {
  camper: { label: "Acampante", icon: ICONS.camper },
  staff: { label: "Equipe", icon: ICONS.staff },
};

export const SELECTION_META: Record<CategorySelection, { label: string; hint: string; emoji: string }> = {
  single: { label: "Escolhe um", hint: "ex.: cama, condição de saúde", emoji: "☝️" },
  multiple: { label: "Escolhe vários", hint: "ex.: alergias, medicações", emoji: "🖐️" },
};

export interface CategoryOption {
  id: string;
  label: string;
  order: number;
  active: boolean;
}

export interface Category {
  id: string;
  key: string;
  name: string;
  emoji: string;
  description: string;
  appliesTo: CategoryAudience[];
  selection: CategorySelection;
  order: number;
  options: CategoryOption[];
  createdAt: string;
  updatedAt: string;
}

export interface CategoryInput {
  name: string;
  emoji: string;
  description?: string;
  appliesTo: CategoryAudience[];
  selection: CategorySelection;
  options?: string[];
}

const json = (token: string) => ({ ...bearer(token), "content-type": "application/json" });

export async function createCategory(token: string, input: CategoryInput): Promise<Category> {
  const res = await command<{ category: Category }>("/api/categories", {
    method: "POST",
    headers: json(token),
    body: JSON.stringify(input),
  }, ["categories"]);
  return res.category;
}

export async function updateCategory(
  token: string,
  id: string,
  patch: Partial<Omit<CategoryInput, "options">>,
): Promise<Category> {
  const res = await command<{ category: Category }>(`/api/categories/${id}`, {
    method: "PUT",
    headers: json(token),
    body: JSON.stringify(patch),
  }, ["categories"]);
  return res.category;
}

export async function deleteCategory(token: string, id: string): Promise<void> {
  await command(`/api/categories/${id}`, { method: "DELETE", headers: bearer(token) }, ["categories"]);
}

export async function reorderCategories(token: string, ids: string[]): Promise<Category[]> {
  const res = await command<{ categories: Category[] }>("/api/categories/reorder", {
    method: "PUT",
    headers: json(token),
    body: JSON.stringify({ ids }),
  }, ["categories"]);
  return res.categories;
}

export async function addOption(token: string, categoryId: string, label: string): Promise<Category> {
  const res = await command<{ category: Category }>(`/api/categories/${categoryId}/options`, {
    method: "POST",
    headers: json(token),
    body: JSON.stringify({ label }),
  }, ["categories"]);
  return res.category;
}

export async function updateOption(
  token: string,
  categoryId: string,
  optionId: string,
  patch: { label?: string; active?: boolean },
): Promise<Category> {
  const res = await command<{ category: Category }>(`/api/categories/${categoryId}/options/${optionId}`, {
    method: "PUT",
    headers: json(token),
    body: JSON.stringify(patch),
  }, ["categories"]);
  return res.category;
}

export async function deleteOption(token: string, categoryId: string, optionId: string): Promise<Category> {
  const res = await command<{ category: Category }>(`/api/categories/${categoryId}/options/${optionId}`, {
    method: "DELETE",
    headers: bearer(token),
  }, ["categories"]);
  return res.category;
}

export async function reorderOptions(token: string, categoryId: string, ids: string[]): Promise<Category> {
  const res = await command<{ category: Category }>(`/api/categories/${categoryId}/options/reorder`, {
    method: "PUT",
    headers: json(token),
    body: JSON.stringify({ ids }),
  }, ["categories"]);
  return res.category;
}

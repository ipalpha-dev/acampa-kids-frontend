import { ageOf, type Camper } from "./api/campers";
import { normName } from "./roomGroups";

/** First name only, unless another person in `peers` shares it — then "Nome Sobrenome". */
export function shortPersonName(full: string, peers: Iterable<{ name: string }>): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return full;
  const first = parts[0];
  const firstNorm = normName(first);
  let hits = 0;
  for (const p of peers) {
    const peerFirst = p.name.trim().split(/\s+/).filter(Boolean)[0] ?? "";
    if (normName(peerFirst) === firstNorm) {
      hits++;
      if (hits > 1) break;
    }
  }
  if (hits > 1 && parts.length > 1) return `${first} ${parts[parts.length - 1]}`;
  return first;
}

/** Floor of the median age of the kids in a room (null when nobody has a birth date). */
export function medianAgeFloor(campers: Iterable<Pick<Camper, "birthDate">>): number | null {
  const ages = [...campers]
    .map((c) => ageOf(c.birthDate ?? null))
    .filter((a): a is number => a !== null)
    .sort((a, b) => a - b);
  if (ages.length === 0) return null;
  const mid =
    ages.length % 2 === 1
      ? ages[(ages.length - 1) / 2]
      : (ages[ages.length / 2 - 1] + ages[ages.length / 2]) / 2;
  return Math.floor(mid);
}

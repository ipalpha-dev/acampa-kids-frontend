/** Paper-cut icons in `public/icons/` — same URLs the app and emails use. */
const icon = (file: string) => `/icons/${file}.png`;

export const ICONS = {
  camper: icon("camper"),
  bunk: icon("bunk"),
  /** top-down single bed, teal frame — boys / staff / Quartos chrome */
  bed: icon("bed"),
  /** same bed as bed.png, teal frame tinted camp pink — girls wing (BedroomTag) */
  bedWoman: icon("bed-woman"),
  girl: icon("girl"),
  boy: icon("boy"),
  man: icon("man"),
  woman: icon("woman"),
  /** head only — the girl with pigtails / the boy in the yellow cap: inline "Meninas" / "Meninos" markers (chips, tabs, labels) */
  girlFace: icon("girl-face"),
  boyFace: icon("boy-face"),
  /** groups of three — "the same room" */
  girls: icon("girls"),
  boys: icon("boys"),
  /** worker with a checklist — programme organizers (admin settings + their tabs) */
  organizer: icon("organizer"),
  /** man in teal camp hat + badge, woman in pink with whistle, hands on his shoulders — "toda a equipe" / Todos */
  staffPair: icon("staff-pair"),
  /** bare head + shoulders — team member still without the vest (a man) */
  noVest: icon("no-vest"),
  /** same pose, a blonde woman with a pointed "bico" bob — still without the vest */
  noVestWoman: icon("no-vest-woman"),
  /** wearing the orange vest — vest is with the person (a man) */
  vest: icon("vest"),
  /** same orange vest, a woman */
  vestWoman: icon("vest-woman"),
  /** lottery cage + ticket — giveaway / Sorteio */
  giveaway: icon("giveaway"),
  /** hand holding up a freshly drawn numbered ball — the "Sortear" action */
  draw: icon("draw"),
  /** orange pencil with a teal eraser — inline "edit this value" actions (the bare button beside a value) */
  pencil: icon("pencil"),
  /** father and mother heads — "Pai ou Responsável" (same drawing as the login parent role) */
  parent: icon("parent"),
  /** head only — teal camp hat + the orange flag: the inline "Líder" marker (a man) */
  leaderFace: icon("leader-face"),
  /** head only — pink camp hat + the orange flag: the inline "Líder" marker (a woman) */
  leaderFaceWoman: icon("leader-face-woman"),
  /** head only — yellow camp cap: the inline "Auxiliar" marker (a man) */
  helperFace: icon("helper-face"),
  /** head only — yellow camp cap: the inline "Auxiliar" marker (a woman) */
  helperFaceWoman: icon("helper-face-woman"),
  /** front-facing bus with a numbered badge — the transports (buses / cars) settings menu */
  transport: icon("transport"),
  /** vintage camera with a cream lens — the Fotos tab and the photographers settings */
  camera: icon("camera"),
  /** glum photographer sitting on the ground, camera set aside — the empty album */
  noPhotos: icon("no-photos"),
  /** kid posing for a vintage camera with a yellow flash — parent face-search card */
  takingPhoto: icon("taking-photo"),
  /** teal phone with a sun-yellow speech-bubble (dark dots) — SMS notifications settings */
  notifications: icon("notifications"),
  /** teal notification bell with a diagonal slash — nobody will be texted (muted) */
  notifyOff: icon("notify-off"),
  /** teal broom sweeping, with sparkles — the end-of-camp cleanup settings */
  cleanup: icon("cleanup"),
  /** closed red-orange hard suitcase with wheels — Preparação (what to pack before camp) */
  preparation: icon("preparation"),
  /** two thick curved arrows in a circle (teal over orange) — "trocar": move room, hand over, swap role */
  swap: icon("swap"),
  /** three pennant flags in teal, orange and sun yellow — the camp teams */
  team: icon("teams"),
  /** light-skin hand clasping a brown-skin hand — pass kids / responsibility to someone else */
  handshake: icon("handshake"),
  /** smiling woman holding her lanyard ID card up beside her face — "quem você é aqui": choosing / showing a profile */
  badge: icon("badge"),
  /** clipboard checklist with two orange ticks and a capsule on top — the Medicações tab (what each kid already took) */
  medications: icon("medications"),
  /** 📅 calendar emoji in pastel camp colours: teal header with 31, cream page with a big 31, orange header dots — the Programação tab */
  schedule: icon("schedule"),
  /** three bars (teal, orange, yellow) on a dark teal baseline — the check-in report "Por veículo" */
  report: icon("report"),
  /** cream list card under a big orange magnifying glass — pick something that already exists */
  chooseExisting: icon("choose-existing"),
  /** teal tile with a cream plus and a sun-yellow sparkle — create something new */
  createNew: icon("create-new"),
  /** spreadsheet with an entering arrow and yellow sparkle — import campers from CSV/Excel */
  importCampers: icon("import-campers"),
  /** bunk bed with two kids tucked in while a curved arrow drops a third kid head on the top mattress — "Montar quartos": assign kids / staff to rooms */
  roomAssign: icon("room-assign"),
  /** assignment checklist topped by a pennant flag — "Montar times" */
  teamAssign: icon("team-assign"),
  /** two bold crossing arrows — automatic team distribution */
  teamDistribute: icon("team-distribute"),
  /** a small boy and a tall teenage girl (ponytail) leaning an elbow on his head — "por idade e sexo": one sex + age range into its rooms */
  ageGroups: icon("age-groups"),
  /** a kid tucked in bed, eyes closed, settled — "manter quem já tem quarto": leave the placed ones where they are */
  keepRoom: icon("keep-room"),
  /** teal camping lantern shaped like a chat bubble, with a cream AI sparkle — read-only camp assistant */
  assistant: icon("assistant"),
  /** same lantern with a transparent center opening for the animated flame */
  assistantEmpty: icon("assistant-empty"),
  /** wooden trail signpost with three direction boards and an orange pennant — the setup wizard */
  wizard: icon("wizard"),
  /** tablet showing the app already full of sample kids, bus, bunk & calendar — the "try it with sample data" wizard choice */
  wizardSample: icon("wizard-sample"),
  /** a desktop monitor showing a room-assignment board next to a crossed-out phone — "use a computer for this" */
  desktopBetter: icon("desktop-better"),
  /** four kids cheering in front of a closed orange curtain that hides the scoreboard, trophy peeking, clock beside — the Placar suspense (dialog + hidden board) */
  scoreSuspense: icon("score-suspense"),
  /** closed orange curtain on a rod with the trophy peeking above — the "Suspense" button / settings card */
  curtain: icon("curtain"),
  /** a desktop monitor showing a bus-seating board next to a crossed-out phone — "use a computer for the buses" */
  desktopBetterBus: icon("desktop-better-bus"),
  /** login / settings role: staff volunteer */
  staff: icon("staff"),
  /** login / settings role: medical team */
  health: icon("health"),
  /** login / settings role: admin */
  admin: icon("admin"),
  /** teal key wearing a small orange crown, sun sparkle beside — the Superusuário settings page (deployment owner) */
  superUser: icon("super-user"),
  /** cream calendar page with a bold orange arrow curving into it — import people / blocks from another year's camp */
  previousYear: icon("previous-year"),
  /** cream lodge with an orange roof and chimney beside a pine — a camp venue (venue picker cards, the chosen venue badge) */
  venue: icon("venue"),
  /** teal map pin standing on a green mound with a small orange flag — a place inside the venue (programme place cards) */
  place: icon("place"),
} as const;

/** A kid's icon follows the wing of the bedroom (meninas / meninos); without a wing, the probable gender. */
export type KidSex = "girl" | "boy";
export type AdultSex = "man" | "woman";

/** "F" | "M" | null as stored on campers and staff (sex or probableGender). */
export type StoredSex = "F" | "M" | null | undefined;

type Wing = "girls" | "boys" | "staff" | null | undefined;

export function kidSexOf(group: Wing, probable?: StoredSex): KidSex | null {
  if (group === "girls") return "girl";
  if (group === "boys") return "boy";
  if (probable === "F") return "girl";
  if (probable === "M") return "boy";
  return null;
}

/**
 * Icon rule: the bedroom wing decides; without a wing, the stored sex, then
 * the probable gender. Unknown → null (the generic camper icon).
 */
export function kidIconSex(group: Wing, sex: StoredSex, probable?: StoredSex): KidSex | null {
  return kidSexOf(group) ?? (sex === "F" ? "girl" : sex === "M" ? "boy" : null) ?? kidSexOf(undefined, probable);
}

function hashParity(seed: string): boolean {
  let n = 0;
  for (let i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) >>> 0;
  return n % 2 === 0;
}

/** session-stable coin flip so unknown-sex faces don't flicker on re-render */
let sessionKidIsGirl: boolean | undefined;
function unknownKidIsGirl(seed?: string): boolean {
  if (seed) return hashParity(seed);
  return (sessionKidIsGirl ??= Math.random() < 0.5);
}

/** Head-only kid marker. Unknown sex → girl or boy at random (stable per seed / session). */
export function kidFaceSrc(sex?: KidSex | "F" | "M" | null, seed?: string): string {
  if (sex === "girl" || sex === "F") return ICONS.girlFace;
  if (sex === "boy" || sex === "M") return ICONS.boyFace;
  return unknownKidIsGirl(seed) ? ICONS.girlFace : ICONS.boyFace;
}

/**
 * Staff sleeping in a kids' room share the wing's sex. No room / staff wing
 * → the stored sex, then the probable gender, else woman (icons).
 */
export function adultSexOf(group: Wing, sex?: StoredSex, probable?: StoredSex): AdultSex {
  if (group === "boys") return "man";
  if (group === "girls") return "woman";
  return (sex ?? probable) === "M" ? "man" : "woman";
}

/** Icon rule for staff: wing first, then stored sex, then probable gender, else woman. */
export function adultIconSex(group: Wing, sex: StoredSex, probable?: StoredSex): AdultSex {
  return adultSexOf(group, sex, probable);
}

/** Top-down bed. Girls wing → pink; boys / staff / unknown → teal. */
export function bedSrc(group?: Wing): string {
  return group === "girls" ? ICONS.bedWoman : ICONS.bed;
}

/** Orange vest on / off. Woman when sex is F; man otherwise. */
export function vestSrc(on: boolean, sex?: "F" | "M" | null): string {
  if (sex === "F") return on ? ICONS.vestWoman : ICONS.noVestWoman;
  return on ? ICONS.vest : ICONS.noVest;
}

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  createAlbum,
  createGalleryEvent,
  deleteGalleryEvent,
  deletePhotos,
  eventsFromProgramme,
  extractZipImages,
  fetchGallery,
  fetchGalleryPhotos,
  fetchKidPhotos,
  importBatch,
  isZip,
  movePhotos,
  planBatches,
  updateAlbum,
  type GalleryEvent,
  type GalleryPhoto,
  type GalleryState,
} from "../api/gallery";
import { photoBlob, photoObjectUrl } from "../api/photoBytes";
import { downloadPhotos, isAbort, saveBlob } from "../galleryDownload";
import { useCollection, useCollectionOrEmpty } from "../store";
import Dialog from "../components/Dialog";
import OptionCards from "../components/OptionCards";
import Toggle from "../components/Toggle";
import { useConfirm } from "../components/ConfirmDialog";
import { ICONS } from "../icons";
import { useI18n } from "../i18n";
import css from "./GalleryPage.module.scss";

interface GalleryPageProps {
  token: string;
  /** organizer / photographer on Acampa's side — the server's `canManage` (and photos-api's canUploadPhotos) decide last */
  canManage: boolean;
  /** a family: the album + "find my child" */
  parentMode?: boolean;
}

/** a section of the album: one moment, or the photos without one */
interface Section {
  key: string;
  title: string;
  when: string | null;
  linked: boolean;
  photos: GalleryPhoto[];
}

const ZONE = "America/Sao_Paulo";

/** "YYYY-MM-DD" of an instant, São Paulo calendar */
function dayOf(iso: string): string {
  return new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

/**
 * The camp album (photos-api through Acampa). Everyone signed in sees the published album, moment by moment, each
 * moment's photos by camera time. Whoever looks after the photos (fotografia, coordenação) creates the edition's album,
 * publishes it, sends the originals (camera time places them on their programme moment) and organizes the rest. A family
 * can look for their own child: only children whose family agreed are ever recognised, and an empty answer is never a
 * statement about the child.
 */
export default function GalleryPage({ token, canManage, parentMode = false }: GalleryPageProps) {
  const { tx, te, tag } = useI18n();
  const stamp = useCollection("gallery");
  const [state, setState] = useState<GalleryState | null>(null);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const [momentsOpen, setMomentsOpen] = useState(false);
  const [viewer, setViewer] = useState<{ list: GalleryPhoto[]; index: number } | null>(null);
  const [kid, setKid] = useState<string>("all");
  const [kidPhotos, setKidPhotos] = useState<GalleryPhoto[] | null>(null);
  const [kidBusy, setKidBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  const manage = canManage && !!state?.canManage;
  const album = state?.album ?? null;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const next = await fetchGallery(token);
        if (!alive) return;
        setState(next);
        setError(null);
        const list = next.album?.readable ? (await fetchGalleryPhotos(token)).photos : [];
        if (alive) setPhotos(list);
      } catch (e) {
        if (alive) setError(te(e, "Não foi possível abrir o álbum agora."));
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, stamp?.version, stamp?.albumId, reload]);

  // a family's search follows the album: new photos may show the child
  useEffect(() => {
    if (!parentMode || kid === "all") return;
    let alive = true;
    setKidBusy(true);
    fetchKidPhotos(token, kid)
      .then((res) => alive && setKidPhotos(res.photos))
      .catch((e) => {
        if (!alive) return;
        setKidPhotos(null);
        setError(te(e, "Não conseguimos procurar as fotos agora. Tente de novo daqui a pouco."));
      })
      .finally(() => alive && setKidBusy(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, kid, parentMode, stamp?.version]);

  const sections = useMemo<Section[]>(() => {
    if (!album) return [];
    const fmtDay = new Intl.DateTimeFormat(tag, { weekday: "short", day: "numeric", month: "short", timeZone: ZONE });
    const fmtTime = new Intl.DateTimeFormat(tag, { hour: "2-digit", minute: "2-digit", timeZone: ZONE });
    const events = [...album.events].sort((a, b) => (a.span?.start ?? "~").localeCompare(b.span?.start ?? "~") || a.name.localeCompare(b.name));
    const byEvent = new Map<string, GalleryPhoto[]>();
    const loose: GalleryPhoto[] = [];
    for (const p of photos) {
      if (p.eventId && events.some((e) => e.id === p.eventId)) byEvent.set(p.eventId, [...(byEvent.get(p.eventId) ?? []), p]);
      else loose.push(p);
    }
    const out: Section[] = events
      .map((e) => ({
        key: e.id,
        title: e.name,
        when: e.span ? `${fmtDay.format(new Date(e.span.start))} · ${fmtTime.format(new Date(e.span.start))}–${fmtTime.format(new Date(e.span.end))}` : null,
        linked: !!e.scheduleEntryId,
        photos: byEvent.get(e.id) ?? [],
      }))
      // the families see moments that already have photos; whoever organizes sees every moment (a place to drop them)
      .filter((s) => manage || s.photos.length > 0);
    if (loose.length > 0) out.push({ key: "loose", title: manage ? tx("Fotos para organizar") : tx("Mais fotos do acampamento"), when: null, linked: false, photos: loose });
    return out;
  }, [album, photos, manage, tx, tag]);

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function endSelection() {
    setSelecting(false);
    setSelected(new Set());
  }

  async function run(fn: () => Promise<string | void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const done = await fn();
      if (done) setNotice(done);
      setReload((n) => n + 1);
    } catch (e) {
      setError(te(e, "Algo deu errado. Tente novamente."));
    } finally {
      setBusy(false);
    }
  }

  async function removeSelected() {
    const ids = [...selected];
    const ok = await confirm({ title: tx("Tirar {n} foto(s) do álbum?", { n: ids.length }), message: tx("Elas saem do álbum para todo mundo. Não dá para desfazer."), confirmLabel: tx("Tirar do álbum") });
    if (!ok) return;
    await run(async () => {
      const n = await deletePhotos(token, ids);
      endSelection();
      return tx("{n} foto(s) saíram do álbum.", { n });
    });
  }

  async function moveSelected(eventId: string | null) {
    const ids = [...selected];
    setMoveOpen(false);
    await run(async () => {
      const n = await movePhotos(token, ids, eventId);
      endSelection();
      return tx("{n} foto(s) mudaram de momento.", { n });
    });
  }

  const shown = parentMode && kid !== "all" ? kidPhotos ?? [] : null;

  return (
    <div className={css.page}>
      <header className={css.head}>
        <img className={css.headIcon} src={ICONS.camera} alt="" aria-hidden="true" />
        <div className={css.headText}>
          <h1 className={css.title}>{album?.name ?? tx("Fotos")}</h1>
          {album?.readable && <p className="cat-hint">{tx("As fotos de cada momento aparecem na ordem em que foram tiradas.")}</p>}
        </div>
      </header>

      {error && (
        <p className={`cat-hint cat-hint--error ${css.message}`} role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className={`cat-hint ${css.message} ${css.notice}`} role="status">
          {notice}
        </p>
      )}

      {!state && !error && (
        <div className={css.grid} aria-busy="true" aria-label={tx("Carregando…")}>
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={css.skeleton} />
          ))}
        </div>
      )}

      {state && !state.edition && <Empty icon={ICONS.noPhotos} text={tx("Este acampamento ainda não tem edição no IPAlpha. O álbum começa quando ela existir.")} />}

      {state?.edition && !album && (manage ? <CreateAlbum token={token} onCreated={() => setReload((n) => n + 1)} /> : <Empty icon={ICONS.noPhotos} text={tx("O álbum deste acampamento ainda não começou. Assim que a equipe enviar as fotos, elas aparecem aqui.")} />)}

      {album && !album.readable && (
        <section className={css.card}>
          {manage ? (
            <>
              <p>{tx("O álbum foi criado e ainda não foi publicado. Até lá, só quem envia as fotos vê o álbum — por aqui ele aparece quando for publicado.")}</p>
              <div className={css.actions}>
                <Uploader token={token} disabled={busy} onDone={(msg) => { setNotice(msg); setReload((n) => n + 1); }} onError={setError} />
                <button type="button" className="button button--primary" disabled={busy} onClick={() => run(async () => { await updateAlbum(token, { published: true }); return tx("Álbum publicado. As famílias e a equipe já podem ver as fotos."); })}>
                  {tx("Publicar o álbum")}
                </button>
              </div>
            </>
          ) : (
            <Empty icon={ICONS.noPhotos} text={tx("As fotos ainda não foram publicadas. Assim que a equipe publicar, elas aparecem aqui.")} />
          )}
        </section>
      )}

      {album?.readable && manage && (
        <section className={`${css.card} ${css.toolbar}`}>
          <div className={css.publish}>
            <Toggle checked={album.published} disabled={busy} label={tx("Álbum publicado")} onChange={(on) => run(async () => { await updateAlbum(token, { published: on }); return on ? tx("Álbum publicado. As famílias e a equipe já podem ver as fotos.") : tx("Álbum guardado. Agora só quem envia as fotos vê o álbum; as famílias veem quando você publicar de novo."); })} />
            <small className="cat-hint">{tx("Publicado: as famílias e a equipe veem as fotos.")}</small>
          </div>
          <div className={css.actions}>
            <Uploader token={token} disabled={busy} onDone={(msg) => { setNotice(msg); setReload((n) => n + 1); }} onError={setError} />
            <button type="button" className="button button--secondary" aria-expanded={momentsOpen} onClick={() => setMomentsOpen((o) => !o)}>
              {tx("Momentos do álbum")}
            </button>
            <button type="button" className="button button--secondary" aria-pressed={selecting} onClick={() => (selecting ? endSelection() : setSelecting(true))}>
              {selecting ? tx("Concluir") : tx("Organizar fotos")}
            </button>
          </div>
          <div className={`${css.fold} ${momentsOpen ? css.foldOpen : ""}`}>
            <div className={css.foldInner}>{momentsOpen && <Moments token={token} events={album.events} onChanged={(msg) => { if (msg) setNotice(msg); setReload((n) => n + 1); }} onError={setError} />}</div>
          </div>
        </section>
      )}

      {album?.readable && parentMode && <KidFinder value={kid} onChange={(k) => { setKid(k); setKidPhotos(null); setError(null); }} />}

      {album?.readable && shown && (
        <section className={css.section} aria-busy={kidBusy}>
          {kidBusy && !kidPhotos ? (
            <div className={css.grid}>
              {Array.from({ length: 4 }, (_, i) => (
                <span key={i} className={css.skeleton} />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <Empty icon={ICONS.takingPhoto} text={tx("Ainda não encontramos fotos por aqui. As fotos chegam aos poucos, conforme a equipe envia e organiza o álbum — volte daqui a pouco.")} />
          ) : (
            <>
              <SectionHead title={tx("Fotos encontradas")} count={shown.length} token={token} photos={shown} />
              <Grid token={token} photos={shown} onOpen={(i) => setViewer({ list: shown, index: i })} />
            </>
          )}
        </section>
      )}

      {album?.readable && !shown && (
        <>
          {sections.length === 0 && <Empty icon={ICONS.noPhotos} text={manage ? tx("Ainda não há fotos. Envie as primeiras — cada uma vai para o momento em que foi tirada.") : tx("Ainda não há fotos. Os fotógrafos estão registrando os melhores momentos!")} />}
          {sections.map((s) => (
            <section key={s.key} className={css.section} aria-label={s.title}>
              <SectionHead title={s.title} when={s.when} linked={s.linked} count={s.photos.length} token={token} photos={s.photos} />
              {s.photos.length === 0 ? (
                <p className="cat-hint">{tx("Nenhuma foto neste momento ainda.")}</p>
              ) : (
                <Grid token={token} photos={s.photos} selecting={selecting} selected={selected} onToggle={toggle} onOpen={(i) => setViewer({ list: s.photos, index: i })} />
              )}
            </section>
          ))}
        </>
      )}

      {selecting && selected.size > 0 && (
        <div className={css.bulk} role="toolbar" aria-label={tx("Fotos escolhidas")}>
          <span>{tx("{n} foto(s) escolhida(s)", { n: selected.size })}</span>
          <button type="button" className="button button--secondary" disabled={busy} onClick={() => setMoveOpen(true)}>
            {tx("Mudar de momento")}
          </button>
          <button type="button" className="button button--danger" disabled={busy} onClick={removeSelected}>
            {tx("Tirar do álbum")}
          </button>
        </div>
      )}

      <Dialog open={moveOpen} onClose={() => setMoveOpen(false)} title={tx("Para qual momento?")} width={460} className="sheet-dialog">
        <OptionCards<string>
          label={tx("Para qual momento?")}
          value={null}
          disabled={busy}
          options={[
            ...(album?.events ?? []).map((e) => ({ key: e.id, icon: ICONS.schedule, title: e.name })),
            { key: "", icon: ICONS.camera, title: tx("Fotos para organizar") },
          ]}
          onChange={(key) => void moveSelected(key || null)}
        />
      </Dialog>

      <Viewer token={token} state={viewer} onClose={() => setViewer(null)} onMove={(index) => setViewer((v) => (v ? { ...v, index } : v))} />
    </div>
  );
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className={css.empty}>
      <img src={icon} alt="" aria-hidden="true" />
      <p>{text}</p>
    </div>
  );
}

/** The edition's album: the camp days (pre-filled from the programme) and whether it opens to everyone at once. */
function CreateAlbum({ token, onCreated }: { token: string; onCreated: () => void }) {
  const { tx, te } = useI18n();
  const events = useCollectionOrEmpty("events");
  const days = events.map((e) => e.date).filter(Boolean).sort();
  const [from, setFrom] = useState(days[0] ?? "");
  const [until, setUntil] = useState(days[days.length - 1] ?? "");
  // new albums start unpublished: the uploaders work on it first, the families see it after "Publicar o álbum"
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(until) && from <= until;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createAlbum(token, { from, until, publish });
      onCreated();
    } catch (err) {
      setError(te(err, "Não foi possível criar o álbum agora."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`${css.card} ${css.create}`} onSubmit={submit}>
      <h2 className={css.cardTitle}>{tx("Criar o álbum do acampamento")}</h2>
      <p className="cat-hint">{tx("Um álbum por ano, no IPAlpha. As fotos ficam guardadas lá; por aqui você envia e organiza.")}</p>
      <div className={css.dates}>
        <label className="cat-field">
          <span className="cat-field__label">{tx("Primeiro dia")}</span>
          <input className="cat-input" type="date" value={from} disabled={busy} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="cat-field">
          <span className="cat-field__label">{tx("Último dia")}</span>
          <input className="cat-input" type="date" value={until} min={from || undefined} disabled={busy} onChange={(e) => setUntil(e.target.value)} />
        </label>
      </div>
      <div className={css.publish}>
        <Toggle checked={publish} disabled={busy} label={tx("Publicar já")} onChange={setPublish} />
        <small className="cat-hint">{publish ? tx("As famílias e a equipe veem as fotos assim que chegam.") : tx("Só quem envia as fotos vê o álbum até você publicar. As famílias veem depois de “Publicar o álbum”.")}</small>
      </div>
      {error && (
        <p className="cat-hint cat-hint--error" role="alert">
          {error}
        </p>
      )}
      <div className={css.actions}>
        <button type="submit" className="button button--primary" disabled={!valid || busy}>
          {busy ? tx("Criando…") : tx("Criar o álbum")}
        </button>
      </div>
    </form>
  );
}

/** The album's moments: one per programme moment (helper), a free one, and taking an empty one away. */
function Moments({ token, events, onChanged, onError }: { token: string; events: GalleryEvent[]; onChanged: (msg?: string) => void; onError: (msg: string) => void }) {
  const { tx, te } = useI18n();
  const confirm = useConfirm();
  const [only, setOnly] = useState<"parents" | "all">("parents");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<string | void>) {
    if (busy) return;
    setBusy(true);
    try {
      onChanged((await fn()) ?? undefined);
    } catch (e) {
      onError(te(e, "Algo deu errado. Tente novamente."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={css.moments}>
      <h2 className={css.cardTitle}>{tx("Um momento para cada momento da programação")}</h2>
      <OptionCards<"parents" | "all">
        label={tx("Quais momentos da programação?")}
        value={only}
        disabled={busy}
        onChange={setOnly}
        options={[
          { key: "parents", icon: ICONS.parent, title: tx("Os que as famílias veem"), subtitle: tx("Os momentos da equipe ficam de fora do álbum.") },
          { key: "all", icon: ICONS.schedule, title: tx("Todos os momentos"), subtitle: tx("O nome de cada momento aparece para as famílias no álbum.") },
        ]}
      />
      <div className={css.actions}>
        <button type="button" className="button button--primary" disabled={busy} onClick={() => act(async () => tx("{n} momento(s) criado(s).", { n: (await eventsFromProgramme(token, only)).created }))}>
          {tx("Criar os momentos")}
        </button>
      </div>

      <form
        className={css.addMoment}
        onSubmit={(e) => {
          e.preventDefault();
          const clean = name.trim();
          if (!clean) return;
          void act(async () => {
            await createGalleryEvent(token, { name: clean });
            setName("");
            return tx("Momento criado.");
          });
        }}
      >
        <label className="cat-field">
          <span className="cat-field__label">{tx("Outro momento")}</span>
          <input className="cat-input" value={name} maxLength={120} disabled={busy} placeholder={tx("Ex.: Fotos da equipe")} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" className="button button--secondary" disabled={busy || !name.trim()}>
          {tx("Adicionar")}
        </button>
      </form>

      {events.length > 0 && (
        <ul className={css.momentList}>
          {events.map((e) => (
            <li key={e.id} className={css.moment}>
              <img src={e.scheduleEntryId ? ICONS.schedule : ICONS.camera} alt="" aria-hidden="true" />
              <span>
                <strong>{e.name}</strong>
                <small className="cat-hint">{e.scheduleEntryId ? tx("Segue o horário da programação") : tx("Momento livre")}</small>
              </span>
              <button
                type="button"
                className="icon-btn icon-btn--bare icon-btn--danger"
                aria-label={tx("Tirar o momento {name}", { name: e.name })}
                disabled={busy}
                onClick={async () => {
                  if (!(await confirm({ title: tx("Tirar o momento {name}?", { name: e.name }), message: tx("Só sai do álbum um momento sem fotos. A programação não muda."), confirmLabel: tx("Tirar") }))) return;
                  void act(async () => {
                    await deleteGalleryEvent(token, e.id);
                    return tx("Momento tirado do álbum.");
                  });
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Sends originals in batches (a .zip is opened on the device); camera time places each photo on its moment. */
function Uploader({ token, disabled, onDone, onError }: { token: string; disabled: boolean; onDone: (msg: string) => void; onError: (msg: string) => void }) {
  const { tx, te } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const picked = [...(e.target.files ?? [])];
    e.target.value = "";
    if (picked.length === 0) return;
    try {
      const files: File[] = [];
      for (const f of picked) files.push(...(isZip(f) ? await extractZipImages(f) : [f]));
      const { batches, refused } = planBatches(files);
      const total = batches.reduce((n, b) => n + b.length, 0);
      setProgress({ done: 0, total });
      let done = 0;
      for (const batch of batches) {
        await importBatch(token, batch);
        done += batch.length;
        setProgress({ done, total });
      }
      onDone(
        refused.length > 0
          ? tx("{n} foto(s) enviada(s). {m} arquivo(s) ficaram de fora (só JPG, PNG ou WebP de até 25 MB).", { n: done, m: refused.length })
          : tx("{n} foto(s) enviada(s). Cada uma foi para o momento em que foi tirada.", { n: done }),
      );
    } catch (err) {
      onError(te(err, "Não foi possível enviar as fotos."));
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className={css.uploader}>
      <input ref={input} className={css.fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp,.zip,application/zip" onChange={pick} aria-label={tx("Escolher fotos")} />
      <button type="button" className="button button--primary" disabled={disabled || !!progress} onClick={() => input.current?.click()}>
        {progress ? tx("Enviando…") : tx("Enviar fotos")}
      </button>
      {progress && (
        <div className={css.progress} role="status">
          <progress max={progress.total} value={progress.done} />
          <small className="cat-hint">{tx("{done} de {total} foto(s)", { done: progress.done, total: progress.total })}</small>
        </div>
      )}
    </div>
  );
}

/** A family picks one of their own children (cards) — or the whole album. */
function KidFinder({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const { tx } = useI18n();
  const kids = useCollectionOrEmpty("campers");
  if (kids.length === 0) return null;
  return (
    <section className={`${css.card} ${css.finder}`}>
      <h2 className={css.cardTitle}>{tx("Encontrar as fotos das crianças sob seus cuidados")}</h2>
      <OptionCards<string>
        row
        label={tx("Quem você quer encontrar?")}
        value={value}
        onChange={onChange}
        options={[
          { key: "all", icon: ICONS.camera, title: tx("Todo o álbum") },
          ...kids.map((k) => ({ key: k.id, icon: k.sex === "F" ? ICONS.girlFace : k.sex === "M" ? ICONS.boyFace : ICONS.camper, title: k.nickname || k.name || tx("Carregando nome…") })),
        ]}
      />
    </section>
  );
}

function SectionHead({ title, when, linked, count, token, photos }: { title: string; when?: string | null; linked?: boolean; count: number; token: string; photos: GalleryPhoto[] }) {
  const { tx } = useI18n();
  const [state, setState] = useState<{ done: number; total: number } | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  async function download() {
    if (state) {
      abort.current?.abort();
      return;
    }
    const ctrl = new AbortController();
    abort.current = ctrl;
    setState({ done: 0, total: photos.length });
    try {
      await downloadPhotos(
        photos.map((p, i) => ({ url: p.originalUrl, folder: "", name: `${String(i + 1).padStart(3, "0")}`, createdAt: p.takenAt ?? p.createdAt ?? new Date().toISOString() })),
        { signal: ctrl.signal, token, zipName: `${title}.zip`, onProgress: (p) => setState({ done: p.done, total: p.total }) },
      );
    } catch (err) {
      if (!isAbort(err)) throw err;
    } finally {
      setState(null);
    }
  }

  return (
    <div className={css.sectionHead}>
      <div>
        <h2 className={css.sectionTitle}>{title}</h2>
        {(when || linked) && <small className="cat-hint">{[when, linked ? tx("da programação") : null].filter(Boolean).join(" · ")}</small>}
      </div>
      <span className={css.count}>{tx("{n} foto(s)", { n: count })}</span>
      {count > 0 && (
        <button type="button" className="icon-btn icon-btn--bare" aria-label={state ? tx("Parar o download") : tx("Baixar as fotos de {title}", { title })} onClick={() => void download().catch(() => setState(null))}>
          {state ? `${state.done}/${state.total}` : "⬇"}
        </button>
      )}
    </div>
  );
}

function Grid({ token, photos, selecting = false, selected, onToggle, onOpen }: { token: string; photos: GalleryPhoto[]; selecting?: boolean; selected?: Set<string>; onToggle?: (id: string) => void; onOpen: (index: number) => void }) {
  const { tx } = useI18n();
  return (
    <ul className={css.grid}>
      {photos.map((p, i) => {
        const on = !!selected?.has(p.id);
        return (
          <li key={p.id} className={css.cell}>
            <button
              type="button"
              className={`${css.tile} ${on ? css.tileOn : ""}`}
              aria-pressed={selecting ? on : undefined}
              aria-label={selecting ? tx("Escolher a foto {n}", { n: i + 1 }) : tx("Abrir a foto {n}", { n: i + 1 })}
              onClick={() => (selecting ? onToggle?.(p.id) : onOpen(i))}
            >
              <PhotoImage token={token} path={p.thumbUrl} />
              {selecting && <span className={css.check} aria-hidden="true">{on ? "✓" : ""}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** One variant, fetched with the session when it scrolls near the screen; fades in once loaded. */
export function PhotoImage({ token, path, alt = "" }: { token: string; path: string; alt?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [near, setNear] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near) return;
    let alive = true;
    setFailed(false);
    photoObjectUrl(token, path)
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [near, token, path]);

  return (
    <span ref={ref} className={css.photo}>
      {src ? <img className={css.img} src={src} alt={alt} draggable={false} /> : <span className={failed ? css.photoFailed : css.photoLoading} aria-hidden="true" />}
    </span>
  );
}

/** One photo large (the medium variant); the original is downloaded only on request. */
function Viewer({ token, state, onClose, onMove }: { token: string; state: { list: GalleryPhoto[]; index: number } | null; onClose: () => void; onMove: (index: number) => void }) {
  const { tx, te } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const photo = state ? state.list[state.index] : null;
  const count = state?.list.length ?? 0;

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && state.index > 0) onMove(state.index - 1);
      if (e.key === "ArrowRight" && state.index < count - 1) onMove(state.index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, count, onMove]);

  async function save() {
    if (!photo) return;
    setError(null);
    try {
      const blob = await photoBlob(token, photo.originalUrl);
      const day = photo.takenAt ? dayOf(photo.takenAt) : "foto";
      saveBlob(blob, `acampa-${day}-${photo.id.slice(-6)}.${blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg"}`);
    } catch (err) {
      setError(te(err, "Não foi possível baixar a foto."));
    }
  }

  return (
    <Dialog open={!!photo} onClose={onClose} title={tx("Foto {n} de {total}", { n: (state?.index ?? 0) + 1, total: count })} width={960} fullscreenOnMobile>
      {photo && (
        <div className={css.viewer}>
          <div className={css.viewerFrame} key={photo.id}>
            <PhotoImage token={token} path={photo.mediumUrl} alt={tx("Foto {n} de {total}", { n: (state?.index ?? 0) + 1, total: count })} />
          </div>
          {error && (
            <p className="cat-hint cat-hint--error" role="alert">
              {error}
            </p>
          )}
          <div className={css.viewerBar}>
            <button type="button" className="button button--secondary" disabled={(state?.index ?? 0) === 0} onClick={() => onMove((state?.index ?? 0) - 1)}>
              {tx("Anterior")}
            </button>
            <button type="button" className="button button--secondary" onClick={() => void save()}>
              {tx("Baixar foto")}
            </button>
            <button type="button" className="button button--secondary" disabled={(state?.index ?? 0) >= count - 1} onClick={() => onMove((state?.index ?? 0) + 1)}>
              {tx("Próxima")}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

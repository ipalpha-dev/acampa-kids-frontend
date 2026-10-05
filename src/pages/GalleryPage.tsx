import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode, type TouchEvent } from "react";
import { createPortal } from "react-dom";
import { deleteGalleryPhotos, extractZipImages, galleryUrl, isZip, reorderGalleryPhotos, searchGalleryPerson, setAlbumPublished, updateGalleryPhotos, uploadGalleryPhoto, zipSupported, type GalleryPhoto } from "../api/gallery";
import { type CampEvent } from "../api/schedule";
import { downloadPhotos, isAbort, safeName, zipsDownloads, type DownloadItem } from "../galleryDownload";
import { useMarqueeSelect } from "../hooks/useMarqueeSelect";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { dayKey, speakDay } from "../dates";
import { useCollection, useCollectionOrEmpty } from "../store";
import Dialog from "../components/Dialog";
import { DownloadGlyph, UploadGlyph } from "../components/Glyph";
import SearchField from "../components/SearchField";
import PageFooter from "../components/PageFooter";
import Toggle from "../components/Toggle";
import { useConfirm } from "../components/ConfirmDialog";
import { ICONS } from "../icons";
import { personInfo, requestNames, usePeopleVersion } from "../store/people";
import { collatorLocale, useI18n } from "../i18n";

interface GalleryPageProps {
  token: string;
  /** admin / organizer or a listed photographer: may upload, edit and publish */
  canManage: boolean;
  /** parents see the published album and may filter it with a face-reference search */
  parentMode?: boolean;
}

/** A download under way (or the card that just finished one). */
interface DownloadState {
  total: number;
  done: number;
  failed: number;
  /** every picture is in, the .zip is being closed */
  zipping: boolean;
  state: "running" | "done" | "stopped" | "error";
  error?: string;
  /** one .zip (computer) or file by file (phone) */
  zip: boolean;
}

type Filter = "all" | "general" | { event: string };

interface UploadJob {
  name: string;
  state: "sending" | "done" | "error";
  error?: string;
}

/** how long the finished upload card takes to fade out (matches the CSS) */
const UPLOAD_LEAVE_MS = 420;

/** how long a deleted tile takes to shrink away (matches `tile-poof` in the CSS) */
const DELETE_LEAVE_MS = 380;

/** touch and hold this long on a photo to pick it (phones have no checkbox) */
const HOLD_MS = 420;

/** how far a finger must travel across the photo sheet to flick to the next one */
const SWIPE_PX = 60;

/** One drop target of the grid: an event, or the general "camp photos" block. */
interface Section {
  /** "event:<id>" or "general" */
  key: string;
  title: string;
  emoji: string;
  /** where a photo dropped here belongs (null = general) */
  eventId: string | null;
  photos: GalleryPhoto[];
}

/** collects every file inside a dropped folder (and its sub-folders) */
async function walkEntry(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File | null>((resolve) => (entry as FileSystemFileEntry).file(resolve, () => resolve(null)));
    // skip .DS_Store & friends
    if (file && !file.name.startsWith(".")) out.push(file);
    return;
  }
  if (!entry.isDirectory) return;
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // readEntries returns at most ~100 entries per call: keep reading until it's empty
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve) => reader.readEntries(resolve, () => resolve([])));
    if (batch.length === 0) return;
    for (const child of batch) await walkEntry(child, out);
  }
}


/**
 * The camp's photo album. Everyone logged in sees the PUBLISHED photos;
 * photographers (and the admin / organizers) additionally see their drafts,
 * send new pictures and flip the album switch — from that moment every parent
 * and team member sees the photos. Pictures may belong to a programme event or
 * be general photos of the camp.
 */
export default function GalleryPage({ token, canManage, parentMode = false }: GalleryPageProps) {
  const { tx } = useI18n();
  const storePhotos = useCollectionOrEmpty("gallery");
  /** parent face-search: null = the whole album; a Set = only those ids */
  const [matchedIds, setMatchedIds] = useState<Set<string> | null>(null);
  const photos = matchedIds ? storePhotos.filter((p) => matchedIds.has(p.id)) : storePhotos;
  const events = useCollectionOrEmpty("events");
  const settings = useCollection("settings");
  const confirm = useConfirm();

  const [filter, setFilter] = useState<Filter>("all");
  const [lightbox, setLightbox] = useState<{ list: GalleryPhoto[]; index: number } | null>(null);
  const [albumBusy, setAlbumBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<UploadJob[] | null>(null);
  /** the finished card is playing its fade-out */
  const [leaving, setLeaving] = useState(false);
  /** photos playing the delete animation (still on screen, already on their way out) */
  const [vanishing, setVanishing] = useState<Set<string>>(new Set());
  /** the "drop or choose files" panel, opened by the “Enviar fotos” button */
  const [pickerOpen, setPickerOpen] = useState(false);
  /** which event the next upload belongs to (null = general camp photos) */
  const [uploadEventId, setUploadEventId] = useState<string | null>(null);
  const [eventPickOpen, setEventPickOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** ids ticked for a bulk action (empty = selection mode is off) */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  /** the photos being dragged to another section / position */
  const [moveDrag, setMoveDrag] = useState<{ ids: string[] } | null>(null);
  /** the download card (progress, then the result) */
  const [dl, setDl] = useState<DownloadState | null>(null);
  const [dlLeaving, setDlLeaving] = useState(false);
  /** aborting it stops the run between (and during) photos */
  const dlAbort = useRef<AbortController | null>(null);
  /** where the insertion marker sits while rearranging */
  const [dropAt, setDropAt] = useState<{ key: string; index: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const referenceInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraGen = useRef(0);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [faceSearching, setFaceSearching] = useState(false);
  /** how the last reference arrived — “Tentar de novo” repeats exactly that */
  const [lastSource, setLastSource] = useState<"camera" | "file">("camera");
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [facePending, setFacePending] = useState(0);
  /** dragenter/dragleave fire for every child element: count them so the overlay doesn't flicker */
  const dragDepth = useRef(0);

  // the preview is an object url: the browser frees it when it is replaced or the tab closes
  useEffect(() => () => {
    if (referencePreview) URL.revokeObjectURL(referencePreview);
  }, [referencePreview]);

  function stopCamera() {
    cameraGen.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setCameraOpen(false);
    setCameraStarting(false);
  }

  useEffect(() => () => {
    cameraGen.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  /** Live viewfinder in the face-search picture. Started from the tap: iPhone drops getUserMedia without a user gesture, and ignores `.click()` on a hidden file input. */
  async function openCamera() {
    if (faceSearching || !anyPublished) return;
    if (cameraOpen) {
      void captureStill();
      return;
    }
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInput.current?.click();
      return;
    }
    const gen = cameraGen.current + 1;
    cameraGen.current = gen;
    setCameraStarting(true);
    setCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      }).catch(() => navigator.mediaDevices.getUserMedia({ audio: false, video: true }));
      if (cameraGen.current !== gen) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setCameraOpen(false);
        setCameraStarting(false);
        return;
      }
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      await video.play();
      if (cameraGen.current !== gen) return;
      setCameraStarting(false);
    } catch (err) {
      if (cameraGen.current !== gen) return;
      stopCamera();
      setError(cameraErrorText(err, tx));
      const name = typeof err === "object" && err && "name" in err ? String((err as { name: unknown }).name) : "";
      if (name !== "NotAllowedError") cameraInput.current?.click();
    }
  }

  async function captureStill() {
    const video = videoRef.current;
    if (!video) return;
    if (!video.videoWidth) {
      await new Promise<void>((resolve) => {
        const done = () => { video.removeEventListener("loadeddata", done); resolve(); };
        video.addEventListener("loadeddata", done);
        window.setTimeout(done, 800);
      });
    }
    if (!video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    stopCamera();
    if (!blob) {
      setError(tx("Não foi possível fotografar. Tente novamente."));
      return;
    }
    void handleReference(new File([blob], "camera.jpg", { type: "image/jpeg" }));
  }

  /**
   * The parent's reference picture. It travels in ONE request, is matched
   * against the album's stored face vectors and is never saved anywhere.
   */
  async function handleReference(file: File | null) {
    if (!parentMode || !file || faceSearching || !anyPublished) return;
    stopCamera();
    setReferencePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setFaceSearching(true);
    setError(null);
    try {
      const result = await searchGalleryPerson(token, file);
      setMatchedIds(new Set(result.matches.map((match) => match.photo.id)));
      setFacePending(result.pendingPhotos);
      setSelected(new Set());
      setLightbox(null);
      setFilter("all");
    } catch (err) {
      setError(err instanceof Error ? err.message : tx("Não foi possível procurar as fotos."));
    } finally {
      setFaceSearching(false);
      if (referenceInput.current) referenceInput.current.value = "";
      if (cameraInput.current) cameraInput.current.value = "";
    }
  }

  function clearSearch() {
    stopCamera();
    setMatchedIds(null);
    setFacePending(0);
    setReferencePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setSelected(new Set());
    setLightbox(null);
    setFilter("all");
    setError(null);
  }

  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  /** phones: the header actions are icons only — the Publicadas switch becomes a globe */
  const phone = useMediaQuery("(max-width: 700px)");
  /** the album switch: one flag for the whole gallery, not per photo */
  const anyPublished = !!settings?.galleryPublished;
  /** events that actually have photos, in programme order (as they happened) */
  const eventSections = useMemo(() => {
    const withPhotos = new Map<string, number>();
    for (const p of photos) if (p.eventId) withPhotos.set(p.eventId, (withPhotos.get(p.eventId) ?? 0) + 1);
    return events
      .filter((e) => withPhotos.has(e.id))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
      .map((e) => ({ event: e, count: withPhotos.get(e.id)! }));
  }, [photos, events]);

  const filterKey = (f: Filter) => (f === "all" || f === "general" ? f : `event:${f.event}`);
  /** a photo whose event is not in the viewer's programme counts as general */
  const isGeneral = (p: GalleryPhoto) => !p.eventId || !eventById.has(p.eventId);
  const visible = useMemo(() => {
    if (filter === "all") return photos;
    if (filter === "general") return photos.filter(isGeneral);
    return photos.filter((p) => p.eventId === filter.event);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, filter, eventById]);
  const generalCount = photos.filter(isGeneral).length;

  /** which section a photo lives in (its event, or the general block) */
  const sectionKeyOf = (p: GalleryPhoto) => (isGeneral(p) ? "general" : `event:${p.eventId}`);

  /** groups of the "Todas" view: one section per event (programme order), photos without an event last */
  const groups = useMemo(() => {
    if (filter !== "all") return null;
    const out: Section[] = [];
    for (const { event } of eventSections) {
      out.push({ key: `event:${event.id}`, title: event.title, emoji: event.emoji || "📅", eventId: event.id, photos: photos.filter((p) => p.eventId === event.id) });
    }
    const general = photos.filter(isGeneral);
    if (general.length > 0) out.push({ key: "general", title: tx("Fotos do acampamento"), emoji: "🏕️", eventId: null, photos: general });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, eventSections, photos, eventById]);

  /**
   * The single section shown by the filtered views. Rearranging works there
   * too; only the "Todas" view offers several sections to move photos between.
   */
  const flatSection: Section = useMemo(() => {
    if (filter !== "all" && filter !== "general") {
      const event = eventById.get(filter.event);
      return { key: `event:${filter.event}`, title: event?.title ?? tx("Evento"), emoji: event?.emoji || "📅", eventId: filter.event, photos: visible };
    }
    return { key: "general", title: tx("Fotos do acampamento"), emoji: "🏕️", eventId: null, photos: visible };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, visible, eventById]);

  // ── uploading ──────────────────────────────────────────────────────────────

  /** the album is empty → the panel is the page, so it stays open and cannot be dismissed */
  const panelOpen = canManage && !jobs && (pickerOpen || photos.length === 0);
  const uploadEvent = uploadEventId ? eventById.get(uploadEventId) ?? null : null;

  const doneCount = jobs ? jobs.filter((j) => j.state !== "sending").length : 0;
  const sending = !!jobs && doneCount < jobs.length;
  const failedCount = jobs ? jobs.filter((j) => j.state === "error").length : 0;
  const progress = jobs && jobs.length > 0 ? Math.round((doneCount / jobs.length) * 100) : 0;

  /**
   * Once everything landed the card ticks, waits, then fades out instead of
   * vanishing: `leaving` plays the animation, a second timer unmounts it when
   * the animation is over (kept in sync with `--up-leave` in the stylesheet).
   */
  useEffect(() => {
    if (!jobs || sending) return;
    const hold = setTimeout(() => setLeaving(true), failedCount > 0 ? 6000 : 2800);
    return () => clearTimeout(hold);
  }, [jobs, sending, failedCount]);

  useEffect(() => {
    if (!leaving) return;
    const gone = setTimeout(() => {
      setJobs(null);
      setLeaving(false);
    }, UPLOAD_LEAVE_MS);
    return () => clearTimeout(gone);
  }, [leaving]);

  async function handlePicked(files: FileList | File[] | null) {
    if (!files || files.length === 0 || !canManage) return;
    // a .zip is opened on the device: every picture inside becomes one upload
    const picked = [...files];
    const opening: UploadJob[] = picked.map((f) => ({ name: f.name, state: "sending" as const }));
    setJobs(opening);
    setLeaving(false); // a new batch cancels a fade-out already under way
    setPickerOpen(false);
    setError(null);
    const list: File[] = [];
    const failures: UploadJob[] = [];
    for (const f of picked) {
      if (!isZip(f)) {
        list.push(f);
        continue;
      }
      try {
        const inside = await extractZipImages(f);
        if (inside.length === 0) failures.push({ name: f.name, state: "error", error: tx("nenhuma foto dentro do zip") });
        else list.push(...inside);
      } catch (err) {
        failures.push({ name: f.name, state: "error", error: err instanceof Error ? err.message : tx("não consegui abrir o zip") });
      }
    }
    setJobs([...list.map((f) => ({ name: f.name, state: "sending" as const })), ...failures]);
    // the panel's event wins; otherwise uploading inside a filtered event adopts it
    const presetEvent = uploadEventId ?? (filter !== "all" && filter !== "general" ? filter.event : null);
    for (let i = 0; i < list.length; i++) {
      try {
        await uploadGalleryPhoto(token, { file: list[i], caption: "", eventId: presetEvent });
        setJobs((prev) => prev?.map((j, k) => (k === i ? { ...j, state: "done" } : j)) ?? null);
      } catch (err) {
        setJobs((prev) => prev?.map((j, k) => (k === i ? { ...j, state: "error", error: err instanceof Error ? err.message : tx("Falhou.") } : j)) ?? null);
      }
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  // ── downloading ────────────────────────────────────────────────────────────

  const dlRunning = dl?.state === "running";
  /** while the .zip is being written the count is full but the work is not over */
  const dlProgress = dl && dl.total > 0 ? Math.round((dl.done / dl.total) * 100) : 0;

  /** the card ticks, waits, then fades out — exactly like the upload one */
  useEffect(() => {
    if (!dl || dl.state === "running") return;
    const hold = setTimeout(() => setDlLeaving(true), dl.state === "done" && dl.failed === 0 ? 2800 : 6000);
    return () => clearTimeout(hold);
  }, [dl]);

  useEffect(() => {
    if (!dlLeaving) return;
    const gone = setTimeout(() => {
      setDl(null);
      setDlLeaving(false);
    }, UPLOAD_LEAVE_MS);
    return () => clearTimeout(gone);
  }, [dlLeaving]);

  // leaving the tab mid-download stops it instead of downloading into nothing
  useEffect(() => () => dlAbort.current?.abort(), []);

  /**
   * Names the files: one folder per event (dropped when everything lands in the
   * same one), each picture numbered in the order it is shown, with its caption
   * when it has one.
   */
  function downloadItems(list: GalleryPhoto[]): DownloadItem[] {
    const seq = new Map<string, number>();
    const items = list.map((p) => {
      const event = p.eventId ? eventById.get(p.eventId) : undefined;
      const folder = event ? safeName(event.title, tx("Evento")) : tx("Fotos do acampamento");
      const n = (seq.get(folder) ?? 0) + 1;
      seq.set(folder, n);
      const caption = p.caption ? safeName(p.caption, "") : "";
      return { url: galleryUrl(p.url), folder, name: `${String(n).padStart(3, "0")}${caption ? ` ${caption}` : ""}`, createdAt: p.createdAt };
    });
    // a single event / the general block: no folder, the pictures sit in the root
    if (new Set(items.map((i) => i.folder)).size < 2) for (const i of items) i.folder = "";
    return items;
  }

  /** what the current view is called, for the .zip's file name */
  function viewLabel(): string {
    if (filter === "all") return tx("acampamento");
    if (filter === "general") return tx("gerais");
    return safeName(eventById.get(filter.event)?.title ?? tx("evento"), tx("evento"));
  }

  async function startDownload(list: GalleryPhoto[], label: string) {
    if (list.length === 0 || dlRunning) return;
    const zip = zipsDownloads();
    // a phone saves one file after another: say so before the prompts start
    if (
      !zip &&
      list.length > 1 &&
      !(await confirm({
        title: tx("Baixar {n} fotos?", { n: list.length }),
        message: tx("No celular as fotos são salvas uma de cada vez. Deixe a tela ligada até terminar."),
        confirmLabel: tx("Baixar"),
        emoji: "⬇️",
      }))
    )
      return;

    const controller = new AbortController();
    dlAbort.current = controller;
    setDlLeaving(false);
    setError(null);
    setDl({ total: list.length, done: 0, failed: 0, zipping: false, state: "running", zip });
    try {
      await downloadPhotos(downloadItems(list), {
        signal: controller.signal,
        zipName: `${tx("fotos")}-${label}-${new Date().toISOString().slice(0, 10)}.zip`,
        onProgress: (p) => setDl((prev) => (prev && prev.state === "running" ? { ...prev, ...p } : prev)),
      });
      setDl((prev) => (prev ? { ...prev, zipping: false, state: "done" } : prev));
    } catch (err) {
      if (isAbort(err)) setDl((prev) => (prev ? { ...prev, zipping: false, state: "stopped" } : prev));
      else setDl((prev) => (prev ? { ...prev, zipping: false, state: "error", error: err instanceof Error ? err.message : tx("Algo deu errado.") } : prev));
    } finally {
      dlAbort.current = null;
    }
  }

  // ── drag & drop ────────────────────────────────────────────────────────────

  /** files dropped straight on the page (a dropped folder is walked recursively) */
  async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
    const entries = [...dt.items]
      .filter((it) => it.kind === "file")
      .map((it) => (typeof it.webkitGetAsEntry === "function" ? it.webkitGetAsEntry() : null));
    if (entries.some((e) => e?.isDirectory)) {
      const out: File[] = [];
      await Promise.all(entries.map((e) => (e ? walkEntry(e, out) : Promise.resolve())));
      return out;
    }
    return [...dt.files];
  }

  // the overlay covers the viewport, so the listeners live on the window: a drop
  // anywhere on the tab is accepted and nothing falls through to the browser
  // (which would navigate away to the dropped file)
  useEffect(() => {
    if (!canManage && !(parentMode && anyPublished)) return;
    const hasFiles = (e: globalThis.DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");

    const onEnter = (e: globalThis.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    };
    const onOver = (e: globalThis.DragEvent) => {
      if (!hasFiles(e)) return;
      // without preventDefault on dragover the browser opens the file instead of dropping it
      e.preventDefault();
      e.dataTransfer!.dropEffect = "copy";
    };
    const onLeave = (e: globalThis.DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onDrop = (e: globalThis.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      void filesFromDrop(e.dataTransfer!).then((files) => {
        if (parentMode) {
          const first = files.find((f) => f.type.startsWith("image/"));
          if (first) void handleReference(first);
          return;
        }
        void handlePicked(files.filter((f) => f.type.startsWith("image/") || isZip(f)));
      });
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
      dragDepth.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, parentMode, filter, token, uploadEventId, anyPublished]);

  /** master switch: publishes every draft (the server texts everyone once) or hides the album again */
  async function toggleAlbum(next: boolean) {
    if (albumBusy) return;
    setAlbumBusy(true);
    setError(null);
    try {
      await setAlbumPublished(token, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : tx("Algo deu errado."));
    } finally {
      setAlbumBusy(false);
    }
  }

  // ── selection (bulk actions) ───────────────────────────────────────────────

  /** the photos the bar acts on, in the order they appear on screen */
  const selectedPhotos = useMemo(() => visible.filter((p) => selected.has(p.id)), [visible, selected]);

  // parents without a reference may tick photos one by one, never the whole album
  const parentLocked = parentMode && !matchedIds;
  const marquee = useMarqueeSelect({ enabled: !parentLocked, selected, onChange: setSelected });

  /**
   * Which section shows the action buttons: the first one (top to bottom) that
   * holds a selected photo. A selection may span several sections, and the
   * buttons act on all of it — they just need one home.
   */
  const actionsSectionKey = useMemo(() => {
    if (selected.size === 0) return null;
    if (!groups) return flatSection.key;
    return groups.find((g) => g.photos.some((p) => selected.has(p.id)))?.key ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, groups, flatSection.key]);

  // leaving the current filter would keep invisible photos selected
  useEffect(() => setSelected(new Set()), [filter]);

  // Esc clears the selection
  useEffect(() => {
    if (selected.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !lightbox) setSelected(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected.size, lightbox]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  /**
   * Touch: there is no checkbox on the tiles — a TOUCH AND HOLD picks the photo
   * (and opens the selection); after that a plain tap keeps ticking, exactly
   * like the phone's own photo app. The hold is cancelled by scrolling.
   */
  const hold = useRef<{ timer: number | null; fired: boolean; x: number; y: number }>({ timer: null, fired: false, x: 0, y: 0 });
  function cancelHold() {
    if (hold.current.timer !== null) {
      clearTimeout(hold.current.timer);
      hold.current.timer = null;
    }
  }
  function startHold(e: TouchEvent<HTMLElement>, id: string) {
    const touch = e.touches[0];
    if (!touch) return;
    cancelHold();
    hold.current.fired = false;
    hold.current.x = touch.clientX;
    hold.current.y = touch.clientY;
    hold.current.timer = window.setTimeout(() => {
      hold.current.timer = null;
      hold.current.fired = true;
      navigator.vibrate?.(25);
      toggleOne(id);
    }, HOLD_MS);
  }
  function moveHold(e: TouchEvent<HTMLElement>) {
    const touch = e.touches[0];
    if (!touch) return;
    if (Math.abs(touch.clientX - hold.current.x) > 10 || Math.abs(touch.clientY - hold.current.y) > 10) cancelHold();
  }

  async function bulkMove(eventId: string | null) {
    const ids = selectedPhotos.map((p) => p.id);
    if (ids.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    setError(null);
    try {
      await updateGalleryPhotos(token, ids, { eventId });
      setMoveOpen(false);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : tx("Algo deu errado."));
    } finally {
      setBulkBusy(false);
    }
  }

  /** lets the tiles play their exit before the store drops them */
  function playVanish(ids: string[]): Promise<void> {
    setVanishing((prev) => new Set([...prev, ...ids]));
    return new Promise((resolve) => setTimeout(resolve, DELETE_LEAVE_MS));
  }

  /** takes the ids out of the "leaving" set once the server confirmed (or failed) */
  function endVanish(ids: string[]) {
    setVanishing((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }

  async function bulkDelete() {
    const ids = selectedPhotos.map((p) => p.id);
    if (ids.length === 0 || bulkBusy) return;
    const many = ids.length > 1;
    if (
      !(await confirm({
        title: many ? tx("Excluir {n} fotos?", { n: ids.length }) : tx("Excluir esta foto?"),
        message: many ? tx("Elas somem para todo mundo. Não dá para desfazer.") : tx("Ela some para todo mundo. Não dá para desfazer."),
        confirmLabel: tx("Excluir"),
        danger: true,
        emoji: "🗑️",
      }))
    )
      return;
    setBulkBusy(true);
    setError(null);
    // the selection clears first: the tiles shrink away without their checkmarks
    setSelected(new Set());
    try {
      await playVanish(ids);
      await deleteGalleryPhotos(token, ids);
    } catch (err) {
      setError(err instanceof Error ? err.message : tx("Algo deu errado."));
    } finally {
      endVanish(ids);
      setBulkBusy(false);
    }
  }

  // ── rearranging (dragging photos between / inside sections) ─────────────────

  /**
   * Dragging a tile onto another section moves the photo(s) to that event;
   * dropping inside the same section rearranges it. Dragging a photo that is
   * part of the current selection carries the whole selection along.
   */
  function startMove(e: DragEvent<HTMLDivElement>, photo: GalleryPhoto) {
    if (!canManage) return;
    const ids = selected.has(photo.id) ? selectedPhotos.map((p) => p.id) : [photo.id];
    setMoveDrag({ ids });
    e.dataTransfer.effectAllowed = "move";
    // Firefox only starts a drag when something is written to the payload
    e.dataTransfer.setData("text/plain", ids.join(","));
  }

  function endMove() {
    setMoveDrag(null);
    setDropAt(null);
  }

  /** remembers where the insertion marker goes (before the tile under the pointer) */
  function overTile(e: DragEvent<HTMLDivElement>, section: Section, index: number) {
    if (!moveDrag) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDropAt((prev) => (prev?.key === section.key && prev.index === index ? prev : { key: section.key, index }));
  }

  async function dropMove(e: DragEvent<HTMLDivElement>, section: Section, index: number) {
    if (!moveDrag) return;
    e.preventDefault();
    e.stopPropagation();
    const ids = moveDrag.ids;
    endMove();
    if (ids.length === 0) return;

    const moved = photos.filter((p) => ids.includes(p.id));
    // every dragged photo already in this section → a pure rearrangement
    const sameSection = moved.every((p) => sectionKeyOf(p) === section.key);

    setBulkBusy(true);
    setError(null);
    try {
      if (!sameSection) await updateGalleryPhotos(token, ids, { eventId: section.eventId });
      // the section as it will look, with the dragged photos lifted out and
      // spliced back in at the drop point
      const rest = section.photos.filter((p) => !ids.includes(p.id));
      const before = section.photos.slice(0, index).filter((p) => !ids.includes(p.id)).length;
      const nextOrder = [...rest.slice(0, before), ...moved, ...rest.slice(before)];
      if (nextOrder.length > 1) await reorderGalleryPhotos(token, nextOrder.map((p) => p.id));
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : tx("Algo deu errado."));
    } finally {
      setBulkBusy(false);
    }
  }

  // ── lightbox keyboard ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightbox]);

  /** phones: flick left / right across the sheet to walk the set */
  const swipe = useRef<{ x: number; y: number } | null>(null);
  function swipeStart(e: TouchEvent<HTMLElement>) {
    const touch = e.touches[0];
    swipe.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }
  function swipeEnd(e: TouchEvent<HTMLElement>) {
    const from = swipe.current;
    const touch = e.changedTouches[0];
    swipe.current = null;
    if (!from || !touch) return;
    const dx = touch.clientX - from.x;
    // a mostly-horizontal flick, so scrolling the sheet never changes the photo
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(touch.clientY - from.y)) return;
    step(dx < 0 ? 1 : -1);
  }

  function step(delta: number) {
    setLightbox((lb) => {
      if (!lb || lb.list.length === 0) return lb;
      const index = (lb.index + delta + lb.list.length) % lb.list.length;
      return { ...lb, index };
    });
  }

  // ── render ─────────────────────────────────────────────────────────────────

  const chip = (key: Filter, label: ReactNode, count: number) => (
    <button type="button" key={filterKey(key)} className={`cat-tab ${filterKey(filter) === filterKey(key) ? "cat-tab--active" : ""}`} onClick={() => setFilter(key)}>
      {label} <span className="cat-tab__count">{count}</span>
    </button>
  );

  /**
   * The right-hand side of a section title: what to do with the selection
   * (only on the section where it starts, so the buttons never double up) and
   * the "select all" checkbox for that section — a tick when every photo is
   * picked, a dash when only some are.
   *
   * There is no "publish" here: publishing is a property of the ALBUM (the
   * “Publicadas” switch in the header), not of single photos.
   */
  const selectAllBox = (list: GalleryPhoto[], sectionKey: string) => {
    if (list.length === 0) return null;
    const canSelectAll = !parentLocked;
    const picked = list.filter((p) => selected.has(p.id)).length;
    const all = picked === list.length;
    const some = picked > 0 && !all;
    if (!canSelectAll && selected.size === 0) return null;
    return (
      <div className="pick-head">
        {selected.size > 0 && sectionKey === actionsSectionKey && (
          <div className="pick-head__actions">
            <span className="pick-head__count">{selected.size === 1 ? tx("{n} selecionada", { n: selected.size }) : tx("{n} selecionadas", { n: selected.size })}</span>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => void startDownload(selectedPhotos, tx("selecionadas"))}
              disabled={dlRunning}
              title={zipsDownloads() ? tx("Baixar as fotos selecionadas em um .zip") : tx("Baixar as fotos selecionadas, uma a uma")}
            >
              <DownloadGlyph /> {tx("Baixar")}
            </button>
            {canManage && (
              <>
                <button type="button" className="button button--secondary" onClick={() => setMoveOpen(true)} disabled={bulkBusy}>
                  {tx("Mover para…")}
                </button>
                <button type="button" className="button button--danger" onClick={() => void bulkDelete()} disabled={bulkBusy}>
                  🗑️ {tx("Excluir")}
                </button>
              </>
            )}
            {/* phones have no Esc: this is how the selection closes */}
            <button
              type="button"
              className="button button--secondary pick-head__clear"
              onClick={() => setSelected(new Set())}
              disabled={bulkBusy}
              title={tx("Cancelar a seleção")}
            >
              ✕
            </button>
          </div>
        )}
        {canSelectAll && (
          <button
            type="button"
            className="pick-all"
            onClick={() =>
              setSelected((prev) => {
                const next = new Set(prev);
                for (const p of list) if (all) next.delete(p.id);
                  else next.add(p.id);
                return next;
              })
            }
            disabled={bulkBusy}
            aria-pressed={all}
            aria-label={all ? tx("Desmarcar todas desta seção") : tx("Selecionar todas desta seção")}
            title={all ? tx("Desmarcar todas desta seção") : tx("Selecionar todas desta seção")}
          >
            <span className={`pick-all__box ${all ? "pick-all__box--on" : ""} ${some ? "pick-all__box--some" : ""}`} aria-hidden="true">
              {all ? "✓" : some ? "–" : ""}
            </span>
          </button>
        )}
      </div>
    );
  };

  const tile = (photo: GalleryPhoto, list: GalleryPhoto[], index: number, section: Section) => {
    const picked = selected.has(photo.id);
    // while a selection is open a plain click keeps picking instead of zooming
    const selecting = selected.size > 0;
    const moving = moveDrag?.ids.includes(photo.id) ?? false;
    const marker = dropAt && dropAt.key === section.key && dropAt.index === index;
    const going = vanishing.has(photo.id);
    return (
      <div
        key={photo.id}
        className={`gallery-cell ${picked ? "gallery-cell--picked" : ""} ${moving ? "gallery-cell--moving" : ""} ${marker ? "gallery-cell--before" : ""} ${going ? "gallery-cell--going" : ""}`}
        // deleting a batch: the tiles leave one after another, not all at once
        style={going ? ({ "--poof-delay": `${Math.min(index, 8) * 45}ms` } as CSSProperties) : undefined}
        data-select-id={!going ? photo.id : undefined}
        // only a picked tile is draggable: on the others the same gesture is the
        // rubber band (a native drag would swallow it). Tick a photo first to
        // move or rearrange it.
        draggable={canManage && !going && picked}
        onDragStart={(e) => startMove(e, photo)}
        onDragEnd={endMove}
        onDragOver={(e) => overTile(e, section, index)}
        onDrop={(e) => void dropMove(e, section, index)}
      >
        {/* no draft badge: the "Publicadas" switch is the visual cue */}
        <button
          type="button"
          className="gallery-tile"
          onClick={(e) => {
            // the touch-and-hold already picked this photo: ignore the tap that follows it
            if (hold.current.fired) {
              hold.current.fired = false;
              return;
            }
            if (selecting || e.shiftKey || e.metaKey || e.ctrlKey) toggleOne(photo.id);
            else setLightbox({ list, index });
          }}
          onTouchStart={(e) => startHold(e, photo.id)}
          onTouchMove={moveHold}
          onTouchEnd={cancelHold}
          onTouchCancel={cancelHold}
          onContextMenu={(e) => {
            // the hold fired: keep the browser's own "save image" menu out of the way
            if (hold.current.fired) e.preventDefault();
          }}
          aria-label={photo.caption || tx("Ver foto")}
          aria-pressed={selecting ? picked : undefined}
          disabled={going}
        >
          <img src={galleryUrl(photo.thumbUrl)} alt={photo.caption || tx("Foto do acampamento")} loading="lazy" draggable={false} />
          {/* a picked photo carries its tick; there is no always-on checkbox to hunt for */}
          {picked && <span className="gallery-tile__tick" aria-hidden="true">✓</span>}
        </button>
        {/* mouse only (hidden on touch, where the hold does this): the selection tick */}
        <button
          type="button"
          className={`gallery-tile__pick ${picked ? "gallery-tile__pick--on" : ""}`}
          onClick={() => toggleOne(photo.id)}
          aria-pressed={picked}
          aria-label={picked ? tx("Desmarcar foto") : tx("Selecionar foto")}
        >
          {picked ? "✓" : ""}
        </button>
      </div>
    );
  };

  const grid = (list: GalleryPhoto[], section: Section) => (
    <div
      className={`gallery-grid ${dropAt?.key === section.key ? "gallery-grid--target" : ""}`}
      onDragOver={(e) => overTile(e, section, list.length)}
      onDrop={(e) => void dropMove(e, section, list.length)}
    >
      {list.map((p, i) => tile(p, list, i, section))}
    </div>
  );

  const current = lightbox ? lightbox.list[lightbox.index] ?? null : null;
  usePeopleVersion();
  useEffect(() => {
    if (current?.byPersonId) requestNames([current.byPersonId]);
  }, [current?.byPersonId]);
  const currentEvent = current?.eventId ? eventById.get(current.eventId) : undefined;

  return (
    <div className="admin-page admin-page--wide">
      {/* rendered at the document root, like Dialog: an ancestor with a transform
          or filter would otherwise anchor the fixed backdrop to the page box */}
      {dragging && !parentMode &&
        createPortal(
          <div className="gallery-drop" aria-hidden="true">
            <span className="gallery-drop__box"><img className="admin-title__icon" src={ICONS.camera} alt="" aria-hidden="true" /> {tx("Solte as fotos aqui")}</span>
          </div>,
          document.body,
        )}
      <header className="admin-head">
        <h1 className="admin-title">
          <img className="admin-title__icon" src={ICONS.camera} alt="" aria-hidden="true" />
          {tx("Fotos")}
        </h1>
        {(canManage || selected.size > 0 || (visible.length > 0 && !parentLocked)) && (
        <div className="admin-head__actions admin-head__actions--icons">
          {/* parents: the whole filtered set after a search, or only what they ticked */}
          {visible.length > 0 && (selected.size > 0 || !parentLocked) && (
            <button
              type="button"
              className="button button--secondary admin-head__new"
              onClick={() => void startDownload(selected.size > 0 ? selectedPhotos : visible, selected.size > 0 ? tx("selecionadas") : viewLabel())}
              disabled={dlRunning}
              title={
                selected.size > 0
                  ? tx("Baixar as {n} fotos selecionadas", { n: selected.size })
                  : zipsDownloads()
                    ? tx("Baixar estas fotos em um .zip")
                    : tx("Baixar estas fotos, uma a uma")
              }
            >
              <DownloadGlyph /> <span className="admin-head__action-label">{selected.size > 0 ? tx("Baixar ({n})", { n: selected.size }) : tx("Baixar")}</span>
            </button>
          )}
          {canManage && (
            <>
              <input ref={fileInput} type="file" accept="image/*,.zip,application/zip" multiple hidden onChange={(e) => void handlePicked(e.target.files)} />
              {/* while the panel is open it IS the upload affordance — no duplicate button */}
              {!panelOpen && (
                <button type="button" className="button button--secondary admin-head__new" onClick={() => setPickerOpen(true)}>
                  <UploadGlyph /> <span className="admin-head__action-label">{tx("Enviar fotos")}</span>
                </button>
              )}
              {/* the switch only makes sense once the album has something to show */}
              {/* phones: the switch becomes a globe — filled green while the album is out, outlined while it is not */}
              {photos.length > 0 && (phone ? (
                <button
                  type="button"
                  className={`icon-btn album-globe ${anyPublished ? "album-globe--on" : ""}`}
                  role="switch"
                  aria-checked={anyPublished}
                  title={anyPublished ? tx("Álbum publicado — os pais veem as fotos") : tx("Álbum não publicado")}
                  aria-label={anyPublished ? tx("Álbum publicado — tocar para despublicar") : tx("Álbum não publicado — tocar para publicar")}
                  disabled={albumBusy}
                  onClick={() => void toggleAlbum(!anyPublished)}
                >
                  <svg className="album-globe__icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M3 12h18" />
                    <path d="M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3Z" />
                  </svg>
                </button>
              ) : (
                <Toggle checked={anyPublished} onChange={(next) => void toggleAlbum(next)} disabled={albumBusy} label={tx("Publicadas")} />
              ))}
            </>
          )}
        </div>
        )}
      </header>
      <p className="admin-intro">{parentMode ? tx("Todas as fotos do acampamento. Uma foto do seu filho filtra as dele — e não fica salva.") : tx("Os momentos do acampamento para pais e equipe")}</p>

      {parentMode && (
        <section className={`face-search${dragging ? " face-search--over" : ""}${cameraOpen ? " face-search--live" : ""}`}>
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void handleReference(e.target.files?.[0] ?? null)} />
          <input ref={referenceInput} type="file" accept="image/*" hidden onChange={(e) => void handleReference(e.target.files?.[0] ?? null)} />
          <div className="face-search__shot">
            {/* always mounted: iPhone only plays a stream attached in the same tap */}
            <video ref={videoRef} className="face-search__video" playsInline muted autoPlay />
            {!cameraOpen && (referencePreview
              ? <img className="face-search__preview" src={referencePreview} alt={tx("Foto de referência")} />
              : <img className="face-search__icon" src={ICONS.takingPhoto} alt="" aria-hidden="true" />)}
            {cameraStarting && <span className="face-search__spinner" aria-hidden="true" />}
          </div>
          <div className="face-search__body">
            {/* the copy follows the state: asking for a picture → aiming the camera →
                a search is already on (the picture is right there, so "mande uma foto"
                would make no sense any more) */}
            <h2 className="face-search__title">
              {cameraOpen ? tx("Enquadre o rosto e fotografe") : matchedIds ? tx("Mostrando as fotos do seu filho") : tx("Encontre as fotos do seu filho")}
            </h2>
            {!cameraOpen && (
              <p className="cat-hint">
                {dragging ? tx("Solte a foto aqui.") : matchedIds ? tx("Não deu certo? Tente novamente.") : tx("Mande uma foto do seu filho para filtrar as dele.")}
              </p>
            )}
            <div className="face-search__actions">
              {/* PHONES ONLY (hidden by CSS above 700px): with a search on, three
                  buttons never fit on one line, so the two “how to search” ones
                  collapse into “Tentar de novo”, repeating whichever was used
                  last. The desktop row below is untouched. */}
              {matchedIds && !cameraOpen && (
                <button
                  type="button"
                  className="button button--primary face-search__retry"
                  onClick={() => (lastSource === "camera" ? void openCamera() : referenceInput.current?.click())}
                  disabled={faceSearching || !anyPublished || cameraStarting}
                  title={lastSource === "camera" ? tx("Fotografar de novo") : tx("Escolher outra foto")}
                >
                  {faceSearching ? tx("Procurando…") : cameraStarting ? tx("Abrindo…") : tx("Tentar de novo")}
                </button>
              )}
              <button
                type="button"
                className={`button button--primary ${matchedIds ? "face-search__again" : ""}`}
                onClick={() => { setLastSource("camera"); void openCamera(); }}
                disabled={faceSearching || !anyPublished || cameraStarting}
              >
                {faceSearching ? tx("Procurando…") : cameraOpen ? tx("Fotografar") : cameraStarting ? tx("Abrindo…") : tx("Abrir câmera")}
              </button>
              {cameraOpen ? (
                <button type="button" className="button button--secondary" onClick={stopCamera}>
                  {tx("Cancelar")}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className={`button button--secondary ${matchedIds ? "face-search__again" : ""}`}
                    onClick={() => { setLastSource("file"); referenceInput.current?.click(); }}
                    disabled={faceSearching || !anyPublished}
                  >
                    {matchedIds ? tx("Escolher outra") : tx("Escolher foto")}
                  </button>
                  {matchedIds && (
                    <button type="button" className="button button--secondary" onClick={clearSearch} disabled={faceSearching}>
                      {tx("Ver todas")}
                    </button>
                  )}
                </>
              )}
            </div>
            {!anyPublished && <p className="cat-hint">{tx("As fotos ainda não foram publicadas.")}</p>}
          </div>
        </section>
      )}

      {error && <p className="message message--error">{error}</p>}

      {/* open on request, and always while the album is empty (nothing else to do here) */}
      {panelOpen && (
        <section className="gallery-upload gallery-upload--picker">
          <div className="gallery-upload__head">
            <h2 className="gallery-upload__title"><img className="admin-title__icon" src={ICONS.camera} alt="" aria-hidden="true" /> {tx("Arraste as fotos para cá")}</h2>
            {/* with an empty album there is nothing to go back to */}
            {photos.length > 0 && (
              <button type="button" className="gallery-upload__close" onClick={() => setPickerOpen(false)}>
                {tx("Fechar")}
              </button>
            )}
          </div>
          <p className="cat-hint">{tx("Solte as fotos (ou uma pasta / .zip) em qualquer lugar da página — ou escolha no aparelho.")}</p>
          <div className="gallery-picker__row">
            {/* where the photos land: the chosen event travels with every upload */}
            <button type="button" className="field-btn" onClick={() => setEventPickOpen(true)}>
              <span className="field-btn__label">{tx("Evento")}</span>
              <span className="field-btn__value">
                {uploadEvent ? `${uploadEvent.emoji || "📅"} ${uploadEvent.title}` : tx("🏕️ Fotos do acampamento")}
              </span>
            </button>
            <button type="button" className="button button--primary" onClick={() => fileInput.current?.click()}>
              {tx("Escolher fotos")}
            </button>
          </div>
        </section>
      )}

      {jobs && (
        <section className={`gallery-upload ${!sending ? "gallery-upload--done" : ""} ${leaving ? "gallery-upload--leaving" : ""}`} aria-live="polite">
          <div className="gallery-upload__head">
            {!sending && (
              /* the ring draws itself, then the tick is stroked on */
              <svg className={`up-check ${failedCount > 0 ? "up-check--warn" : ""}`} viewBox="0 0 52 52" aria-hidden="true">
                <circle className="up-check__circle" cx="26" cy="26" r="23" />
                <path className="up-check__tick" d="M15 27 l8 8 l15 -16" />
              </svg>
            )}
            {sending ? (
              <h2 className="gallery-upload__title">{tx("Enviando {done} de {total}…", { done: doneCount, total: jobs.length })}</h2>
            ) : failedCount > 0 ? (
              <h2 className="gallery-upload__title">{failedCount === 1 ? tx("Envio concluído com {n} erro", { n: failedCount }) : tx("Envio concluído com {n} erros", { n: failedCount })}</h2>
            ) : (
              <h2 className="gallery-upload__title">{jobs.length === 1 ? tx("{n} foto enviada", { n: jobs.length }) : tx("{n} fotos enviadas", { n: jobs.length })}</h2>
            )}
            {sending && <span className="gallery-upload__pct">{progress}%</span>}
          </div>

          <div className="up-bar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className={`up-bar__fill ${!sending && failedCount === 0 ? "up-bar__fill--ok" : ""}`} style={{ width: `${progress}%` }} />
          </div>

          {/* only the failures stay listed: a wall of green ticks says nothing */}
          {failedCount > 0 && (
            <ul className="gallery-upload__list">
              {jobs
                .filter((j) => j.state === "error")
                .map((j, i) => (
                  <li key={i} className="gallery-upload__item gallery-upload__item--err">
                    ❌ {j.name}
                    {j.error ? ` — ${j.error}` : ""}
                  </li>
                ))}
            </ul>
          )}

          {!sending && (
            <button type="button" className="gallery-upload__close" onClick={() => setLeaving(true)}>
              {tx("Fechar")}
            </button>
          )}
        </section>
      )}

      {/* download progress — same card, same place as the upload one */}
      {dl && (
        <section className={`gallery-upload ${dl.state !== "running" ? "gallery-upload--done" : ""} ${dlLeaving ? "gallery-upload--leaving" : ""}`} aria-live="polite">
          <div className="gallery-upload__head">
            {dl.state === "done" && (
              <svg className={`up-check ${dl.failed > 0 ? "up-check--warn" : ""}`} viewBox="0 0 52 52" aria-hidden="true">
                <circle className="up-check__circle" cx="26" cy="26" r="23" />
                <path className="up-check__tick" d="M15 27 l8 8 l15 -16" />
              </svg>
            )}
            {dl.state === "running" ? (
              <h2 className="gallery-upload__title">{dl.zipping ? tx("Montando o arquivo .zip…") : tx("Baixando {done} de {total}…", { done: dl.done, total: dl.total })}</h2>
            ) : dl.state === "stopped" ? (
              <h2 className="gallery-upload__title">{tx("Download interrompido — {done} de {total}", { done: dl.done, total: dl.total })}</h2>
            ) : dl.state === "error" ? (
              <h2 className="gallery-upload__title">{tx("Não consegui baixar as fotos")}</h2>
            ) : dl.failed > 0 ? (
              <h2 className="gallery-upload__title">{dl.failed === 1 ? tx("Download concluído com {n} erro", { n: dl.failed }) : tx("Download concluído com {n} erros", { n: dl.failed })}</h2>
            ) : (
              <h2 className="gallery-upload__title">{dl.total === 1 ? tx("{n} foto baixada", { n: dl.total }) : tx("{n} fotos baixadas", { n: dl.total })}</h2>
            )}
            {dl.state === "running" && <span className="gallery-upload__pct">{dlProgress}%</span>}
            {/* stopping mid-run keeps whatever already landed */}
            {dl.state === "running" && (
              <button type="button" className="button button--secondary gallery-upload__stop" onClick={() => dlAbort.current?.abort()}>
                {tx("Parar")}
              </button>
            )}
          </div>

          <div className="up-bar" role="progressbar" aria-valuenow={dlProgress} aria-valuemin={0} aria-valuemax={100}>
            <div className={`up-bar__fill ${dl.state === "done" && dl.failed === 0 ? "up-bar__fill--ok" : ""}`} style={{ width: `${dlProgress}%` }} />
          </div>

          {dl.state === "error" && dl.error && <p className="gallery-upload__item gallery-upload__item--err">❌ {dl.error}</p>}
          {dl.state !== "error" && dl.failed > 0 && (
            <p className="gallery-upload__item gallery-upload__item--err">
              ❌ {dl.failed === 1 ? tx("{n} foto não pôde ser baixada", { n: dl.failed }) : tx("{n} fotos não puderam ser baixadas", { n: dl.failed })}
            </p>
          )}
          {dl.state === "running" && !dl.zip && <p className="cat-hint">{tx("Salvando uma foto de cada vez — mantenha esta tela aberta.")}</p>}

          {dl.state !== "running" && (
            <button type="button" className="gallery-upload__close" onClick={() => setDlLeaving(true)}>
              {tx("Fechar")}
            </button>
          )}
        </section>
      )}

      {parentMode && matchedIds && (
        <p className="face-search__result">
          {photos.length === 1 ? tx("{n} foto com o seu filho", { n: photos.length }) : tx("{n} fotos com o seu filho", { n: photos.length })}
          {facePending > 0 ? ` · ${facePending === 1 ? tx("{n} ainda sendo analisada", { n: facePending }) : tx("{n} ainda sendo analisadas", { n: facePending })}` : ""}
        </p>
      )}

      {!parentMode && photos.length > 0 && (
        <nav className="cat-tabs" aria-label={tx("Filtrar fotos")}>
          {chip("all", tx("Todas"), photos.length)}
          {/* same order as the sections: programme order, sem evento no fim */}
          {eventSections.map(({ event, count }) => chip({ event: event.id }, <>{event.emoji || "📅"} {event.title}</>, count))}
          {generalCount > 0 && chip("general", tx("🏕️ Gerais"), generalCount)}
        </nav>
      )}

      {/* the marquee reads the tiles inside this container */}
      {/* --selecting swaps the tile cursors: a click now picks instead of zooming */}
      <div className={`gallery-surface ${selected.size > 0 ? "gallery-surface--selecting" : ""}`} ref={marquee.containerRef} {...marquee.handlers}>
        {photos.length === 0 ? (
          <div className="admin-empty">
            <img className="admin-empty__icon admin-empty__icon--lg" src={ICONS.noPhotos} alt="" aria-hidden="true" />
            <p>
              {parentMode && matchedIds
                ? tx("Não encontramos o seu filho. Tente outra foto, de frente e com boa luz — ou veja o álbum inteiro.")
                : canManage
                  ? tx("Nenhuma foto ainda — arraste as fotos para cá para começar.")
                  : tx("Ainda não há fotos. Os fotógrafos estão capturando os melhores momentos!")}
            </p>
            {parentMode && matchedIds && facePending > 0 && <p className="cat-hint">{facePending === 1 ? tx("{n} foto ainda está sendo analisada.", { n: facePending }) : tx("{n} fotos ainda estão sendo analisadas.", { n: facePending })}</p>}
          </div>
        ) : visible.length === 0 ? (
          <p className="opt-empty">{tx("Nenhuma foto aqui.")}</p>
        ) : groups ? (
          groups.map((g) => (
            <section key={g.key} className={`gallery-group ${dropAt?.key === g.key ? "gallery-group--target" : ""}`}>
              <header className="room-group__head gallery-group__head">
                <h2 className="room-group__title room-group__title--green">
                  {g.emoji} {g.title}
                  {g.key.startsWith("event:") && eventById.get(g.key.slice(6)) && <span className="gallery-group__date"> · {speakDay(eventById.get(g.key.slice(6))!.date, "month")}</span>}
                </h2>
                {selectAllBox(g.photos, g.key)}
              </header>
              {grid(g.photos, g)}
            </section>
          ))
        ) : (
          <section className="gallery-group">
            <header className="room-group__head gallery-group__head">
              <h2 className="room-group__title room-group__title--green">
                {flatSection.emoji} {flatSection.title}
              </h2>
              {selectAllBox(visible, flatSection.key)}
            </header>
            {grid(visible, flatSection)}
          </section>
        )}
      </div>

      {/* the rubber band itself (fixed to the viewport, like the drop overlay) */}
      {marquee.rect && createPortal(<div className="gallery-marquee" style={marquee.rect} aria-hidden="true" />, document.body)}

      <PageFooter className={!parentMode && !canManage ? "footer-note--gallery-publish" : undefined}>
        {parentMode ? (
          <><img className="admin-title__icon" src={ICONS.camera} alt="" aria-hidden="true" /> {tx("Sua foto de referência não fica salva.")}</>
        ) : canManage ? (
          <><img className="admin-title__icon" src={ICONS.camera} alt="" aria-hidden="true" /> {tx("Ao ligar Publicadas, pais e equipe veem na hora.")}</>
        ) : (
          <><img className="admin-title__icon" src={ICONS.camera} alt="" aria-hidden="true" /> {tx("Novas fotos aparecem aqui assim que o fotógrafo publica.")}</>
        )}
      </PageFooter>

      {/* the photo itself: a card on a computer, a bottom sheet on phones */}
      <Dialog open={!!current} onClose={() => setLightbox(null)} title={tx("Foto")} width={860} className="photo-sheet-dialog">
        {current && (
          <div className="lightbox" onTouchStart={swipeStart} onTouchEnd={swipeEnd}>
            <span className="lightbox__handle" aria-hidden="true" />
            <img className="lightbox__img" src={galleryUrl(current.url)} alt={current.caption || tx("Foto do acampamento")} />
            <div className="lightbox__nav">
              <button type="button" className="icon-btn icon-btn--lg" onClick={() => step(-1)} aria-label={tx("Foto anterior")} disabled={lightbox!.list.length < 2}>
                ◀
              </button>
              <span className="lightbox__count">
                {tx("{n} de {total}", { n: lightbox!.index + 1, total: lightbox!.list.length })}
              </span>
              <button type="button" className="icon-btn icon-btn--lg" onClick={() => step(1)} aria-label={tx("Próxima foto")} disabled={lightbox!.list.length < 2}>
                ▶
              </button>
            </div>
            {current.caption && <p className="lightbox__caption">{current.caption}</p>}
            <p className="lightbox__meta">
              {currentEvent ? `${currentEvent.emoji || "📅"} ${currentEvent.title} · ` : ""}
              {tx("por {name}", { name: personInfo(current.byPersonId)?.name || "—" })} · {speakDay(dayKey(current.createdAt), "month")}
            </p>

            {/* carousel: every photo of the set, the open one highlighted */}
            {lightbox!.list.length > 1 && (
              <div className="lb-reel" role="tablist" aria-label={tx("Fotos")}>
                {lightbox!.list.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    role="tab"
                    aria-selected={i === lightbox!.index}
                    aria-label={p.caption || tx("Foto {n}", { n: i + 1 })}
                    className={`lb-reel__item ${i === lightbox!.index ? "lb-reel__item--on" : ""}`}
                    // keeps the open photo in view as the user steps with the arrows / keyboard
                    ref={i === lightbox!.index ? (el) => el?.scrollIntoView({ block: "nearest", inline: "center" }) : undefined}
                    onClick={() => setLightbox((lb) => (lb ? { ...lb, index: i } : lb))}
                  >
                    <img src={galleryUrl(p.thumbUrl)} alt="" loading="lazy" draggable={false} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* where new photos land — the programme in the order it happens */}
      <EventPickerDialog
        open={eventPickOpen}
        events={events}
        selectedId={uploadEventId}
        onClose={() => setEventPickOpen(false)}
        onPick={(id) => {
          setUploadEventId(id);
          setEventPickOpen(false);
        }}
      />

      {/* bulk move: pick the event the whole selection goes to */}
      <Dialog open={moveOpen} onClose={() => setMoveOpen(false)} title={tx("Mover fotos")} width={520}>
        <div className="cat-form cat-form--embedded">
          <h2 className="cat-form__title">{selected.size === 1 ? tx("Mover {n} foto para", { n: selected.size }) : tx("Mover {n} fotos para", { n: selected.size })}</h2>
          <div className="gallery-move">
            <button type="button" className="gallery-move__item" disabled={bulkBusy} onClick={() => void bulkMove(null)}>
              {tx("🏕️ Fotos do acampamento")} <span className="gallery-move__hint">{tx("sem evento")}</span>
            </button>
            {[...events]
              .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime))
              .map((e) => (
                <button key={e.id} type="button" className="gallery-move__item" disabled={bulkBusy} onClick={() => void bulkMove(e.id)}>
                  {e.emoji || "📅"} {e.title} <span className="gallery-move__hint">{speakDay(e.date, "month")}</span>
                </button>
              ))}
          </div>
          {events.length === 0 && <p className="cat-hint">{tx("Nenhum evento na programação ainda.")}</p>}
          <div className="cat-form__actions">
            <button type="button" className="button button--secondary" onClick={() => setMoveOpen(false)} disabled={bulkBusy}>
              {tx("Cancelar")}
            </button>
          </div>
        </div>
      </Dialog>

    </div>
  );
}

function cameraErrorText(err: unknown, tx: (pt: string, vars?: Record<string, string | number>) => string): string {
  const name = typeof err === "object" && err && "name" in err ? String((err as { name: unknown }).name) : "";
  if (name === "NotAllowedError") return tx("Permita o acesso à câmera nas configurações do iPhone e tente novamente.");
  if (name === "NotFoundError") return tx("Nenhuma câmera foi encontrada neste aparelho.");
  if (name === "NotReadableError") return tx("A câmera está sendo usada por outro aplicativo.");
  if (!window.isSecureContext) return tx("A câmera só funciona em uma conexão segura (HTTPS).");
  return tx("Não foi possível abrir a câmera. Confira a permissão e tente novamente.");
}

interface EventPickerDialogProps {
  open: boolean;
  events: CampEvent[];
  /** null = the general "camp photos" bucket */
  selectedId: string | null;
  onClose: () => void;
  onPick: (id: string | null) => void;
}

/**
 * Chooses the event new photos belong to. A native <select> shows a bare list
 * of titles; the programme only makes sense with the day, the time and the
 * emoji, so this is a real dialog grouped by day, in the order things happen.
 * Day headers stick while that day's events scroll; the search stays put.
 */
function EventPickerDialog({ open, events, selectedId, onClose, onPick }: EventPickerDialogProps) {
  const { tx } = useI18n();
  const [q, setQ] = useState("");
  useEffect(() => {
    if (open) setQ("");
  }, [open]);
  const collator = collatorLocale();
  const query = q.trim().toLocaleLowerCase(collator);

  /** chronological (the programme as it unfolds), grouped by day, filtered by search */
  const days = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
    const match = (e: CampEvent) => {
      if (!query) return true;
      const day = speakDay(e.date).toLocaleLowerCase(collator);
      const hay = `${e.emoji} ${e.title} ${e.startTime} ${e.endTime ?? ""} ${day}`;
      return hay.toLocaleLowerCase(collator).includes(query);
    };
    const out: { date: string; events: CampEvent[] }[] = [];
    for (const e of sorted) {
      if (!match(e)) continue;
      const last = out[out.length - 1];
      if (last && last.date === e.date) last.events.push(e);
      else out.push({ date: e.date, events: [e] });
    }
    return out;
  }, [events, query, collator]);

  const generalLabel = tx("fotos do acampamento");
  const showGeneral = !query || generalLabel.toLocaleLowerCase(collator).includes(query) || tx("gerais").toLocaleLowerCase(collator).includes(query) || tx("sem evento").toLocaleLowerCase(collator).includes(query);
  const empty = events.length === 0;
  const noHits = !empty && !showGeneral && days.length === 0;

  return (
    <Dialog open={open} onClose={onClose} title={tx("Escolher evento")} width={520} className="picker-sheet-dialog">
      <div className="picker picker-sheet">
        <header className="picker-sheet__head">
          <span className="picker-sheet__handle" aria-hidden="true" />
          <h2 className="cat-form__title">{tx("Onde entram as fotos?")}</h2>
          <SearchField
            placeholder={tx("Buscar evento, dia ou horário…")}
            value={q}
            onChange={setQ}
            aria-label={tx("Buscar evento")}
          />
        </header>

        <div className="picker-sheet__body">
        <div className="ev-pick__list">
          {showGeneral && (
            <button type="button" className={`ev-pick__item ${selectedId === null ? "ev-pick__item--on" : ""}`} onClick={() => onPick(null)}>
              <span className="ev-pick__emoji">🏕️</span>
              <span className="ev-pick__body">
                <span className="ev-pick__title">{tx("Fotos do acampamento")}</span>
                <span className="ev-pick__meta">{tx("sem evento — momentos gerais")}</span>
              </span>
              {selectedId === null && <span className="ev-pick__check" aria-hidden="true">✓</span>}
            </button>
          )}

          {days.map((day) => (
            <div key={day.date} className="ev-pick__day">
              <h3 className="ev-pick__dayhead">{speakDay(day.date)}</h3>
              {day.events.map((e) => (
                <button key={e.id} type="button" className={`ev-pick__item ${selectedId === e.id ? "ev-pick__item--on" : ""}`} onClick={() => onPick(e.id)}>
                  <span className="ev-pick__emoji">{e.emoji || "📅"}</span>
                  <span className="ev-pick__body">
                    <span className="ev-pick__title">{e.title}</span>
                    <span className="ev-pick__meta">
                      {e.startTime}
                      {e.endTime ? ` – ${e.endTime}` : ""}
                    </span>
                  </span>
                  {selectedId === e.id && <span className="ev-pick__check" aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          ))}

          {empty && <p className="cat-hint">{tx("Nenhum evento na programação ainda — as fotos ficam como gerais.")}</p>}
          {noHits && <p className="opt-empty">{tx("Nenhum evento encontrado.")}</p>}
        </div>
        </div>

        <div className="cat-form__actions picker-sheet__actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            {tx("Cancelar")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { ApiError } from "../api/client";
import { LITERALS as GALLERY } from "../i18n/pending/gallery";
import type { GalleryPhoto, GalleryState } from "../api/gallery";
import GalleryPage from "./GalleryPage";

const store = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));
vi.mock("../store", () => ({
  useCollection: (name: string) => store.data[name] ?? null,
  useCollectionOrEmpty: (name: string) => store.data[name] ?? [],
}));

const api = vi.hoisted(() => ({
  fetchGallery: vi.fn(),
  fetchGalleryPhotos: vi.fn(),
  fetchKidPhotos: vi.fn(),
  createAlbum: vi.fn(),
  updateAlbum: vi.fn(),
  eventsFromProgramme: vi.fn(),
  createGalleryEvent: vi.fn(),
  deleteGalleryEvent: vi.fn(),
  movePhotos: vi.fn(),
  deletePhotos: vi.fn(),
  importBatch: vi.fn(),
}));
vi.mock("../api/gallery", async (importOriginal) => ({ ...(await importOriginal<typeof import("../api/gallery")>()), ...api }));

const bytes = vi.hoisted(() => ({ photoObjectUrl: vi.fn(), photoBlob: vi.fn(), clearPhotoBytes: vi.fn() }));
vi.mock("../api/photoBytes", () => bytes);

const photo = (id: string, eventId: string | null, takenAt: string | null): GalleryPhoto => ({
  id,
  eventId,
  placement: eventId ? "event" : "unsorted",
  takenAt,
  createdAt: "2026-07-11T20:00:00.000Z",
  contentType: "image/jpeg",
  bytes: 10,
  thumbUrl: `/api/gallery/photos/${id}/thumb`,
  mediumUrl: `/api/gallery/photos/${id}/medium`,
  originalUrl: `/api/gallery/photos/${id}/original`,
});

const album = (over: Partial<NonNullable<GalleryState["album"]>> = {}): GalleryState["album"] => ({
  id: "a1",
  name: "Acampa Kids 2026",
  icon: "🏕️",
  published: true,
  readable: true,
  events: [
    { id: "e2", name: "Fogueira", span: { start: "2026-07-11T22:00:00.000Z", end: "2026-07-11T23:30:00.000Z" }, scheduleEntryId: "entry-2" },
    { id: "e1", name: "Gincana", span: { start: "2026-07-11T13:00:00.000Z", end: "2026-07-11T16:00:00.000Z" }, scheduleEntryId: "entry-1" },
  ],
  ...over,
});

function ui(props: { canManage?: boolean; parentMode?: boolean } = {}) {
  return render(
    <I18nProvider>
      <GalleryPage token="session-token" canManage={props.canManage ?? false} parentMode={props.parentMode ?? false} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
  store.data = { gallery: { albumId: "a1", version: 1 }, campers: [], events: [] };
  for (const fn of Object.values(api)) fn.mockReset();
  bytes.photoObjectUrl.mockReset().mockResolvedValue("blob:photo");
  bytes.photoBlob.mockReset();
  api.fetchGalleryPhotos.mockResolvedValue({ photos: [], readable: true, truncated: false });
});

describe("GalleryPage — the album on photos-api", () => {
  it("shows the moments in programme order, each with its photos; images come through the session (object URLs)", async () => {
    api.fetchGallery.mockResolvedValue({ album: album(), canManage: false, edition: true });
    api.fetchGalleryPhotos.mockResolvedValue({ photos: [photo("p1", "e1", "2026-07-11T14:00:00.000Z"), photo("p2", "e2", "2026-07-11T22:10:00.000Z"), photo("p3", null, null)], readable: true, truncated: false });
    ui();
    const sections = await screen.findAllByRole("region");
    expect(sections.map((s) => s.getAttribute("aria-label"))).toEqual(["Gincana", "Fogueira", "Mais fotos do acampamento"]);
    await waitFor(() => expect(bytes.photoObjectUrl).toHaveBeenCalledWith("session-token", "/api/gallery/photos/p1/thumb"));
    expect(screen.queryByRole("button", { name: "Enviar fotos" })).toBeNull();
  });

  it("an album not published yet reads gently for a family (never an error)", async () => {
    api.fetchGallery.mockResolvedValue({ album: album({ readable: false, published: false, events: [] }), canManage: false, edition: true });
    ui({ parentMode: true });
    expect(await screen.findByText(/As fotos ainda não foram publicadas/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(api.fetchGalleryPhotos).not.toHaveBeenCalled();
  });

  it("whoever looks after the photos creates the edition's album with the camp days — NOT published by default (families see it after Publicar)", async () => {
    store.data.events = [{ id: "x", date: "2026-07-10" }, { id: "y", date: "2026-07-13" }];
    api.fetchGallery.mockResolvedValue({ album: null, canManage: true, edition: true });
    api.createAlbum.mockResolvedValue(album({ published: false }));
    ui({ canManage: true });
    expect(await screen.findByText(/Só quem envia as fotos vê o álbum até você publicar/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Criar o álbum" }));
    await waitFor(() => expect(api.createAlbum).toHaveBeenCalledWith("session-token", { from: "2026-07-10", until: "2026-07-13", publish: false }));
  });

  it("the switch still publishes it right away when asked", async () => {
    store.data.events = [{ id: "x", date: "2026-07-10" }, { id: "y", date: "2026-07-13" }];
    api.fetchGallery.mockResolvedValue({ album: null, canManage: true, edition: true });
    api.createAlbum.mockResolvedValue(album());
    ui({ canManage: true });
    fireEvent.click(await screen.findByRole("switch", { name: "Publicar já" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar o álbum" }));
    await waitFor(() => expect(api.createAlbum).toHaveBeenCalledWith("session-token", { from: "2026-07-10", until: "2026-07-13", publish: true }));
  });

  it("sends the originals in batches and says where they went; a refusal from core reads gently", async () => {
    api.fetchGallery.mockResolvedValue({ album: album(), canManage: true, edition: true });
    api.importBatch.mockResolvedValue([]);
    const { container } = ui({ canManage: true });
    await screen.findByRole("button", { name: "Enviar fotos" });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const files = Array.from({ length: 52 }, (_, i) => new File([new Uint8Array([1])], `p${i}.jpg`, { type: "image/jpeg" }));
    fireEvent.change(input, { target: { files: [...files, new File(["x"], "notes.txt", { type: "text/plain" })] } });
    await waitFor(() => expect(api.importBatch).toHaveBeenCalledTimes(2));
    expect(api.importBatch.mock.calls[0][1]).toHaveLength(50);
    expect(api.importBatch.mock.calls[1][1]).toHaveLength(2);
    expect(await screen.findByRole("status")).toHaveTextContent("52 foto(s) enviada(s). 1 arquivo(s) ficaram de fora");

    api.importBatch.mockRejectedValue(new ApiError(403, "PHOTOS_NOT_UPLOADER", "Só quem cuida das fotos (fotografia ou coordenação) pode enviar ou organizar o álbum. Nada foi alterado."));
    fireEvent.change(input, { target: { files: [files[0]] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Só quem cuida das fotos");
  });

  it("one album moment per programme moment: the families' moments by default (option cards)", async () => {
    api.fetchGallery.mockResolvedValue({ album: album({ events: [] }), canManage: true, edition: true });
    api.eventsFromProgramme.mockResolvedValue({ created: 3, skipped: 0, alreadyLinked: 0 });
    ui({ canManage: true });
    fireEvent.click(await screen.findByRole("button", { name: "Momentos do álbum" }));
    const cards = screen.getByRole("radiogroup", { name: "Quais momentos da programação?" });
    expect(within(cards).getByRole("radio", { name: /Os que as famílias veem/ })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: "Criar os momentos" }));
    await waitFor(() => expect(api.eventsFromProgramme).toHaveBeenCalledWith("session-token", "parents"));
    expect(await screen.findByRole("status")).toHaveTextContent("3 momento(s) criado(s).");
  });

  it("a family looks for their own child; no photos yet is said gently, never as a verdict about the child", async () => {
    store.data.campers = [{ id: "kid-1", name: "Ana Exemplo", nickname: "Aninha", sex: "F" }];
    api.fetchGallery.mockResolvedValue({ album: album(), canManage: false, edition: true });
    api.fetchKidPhotos.mockResolvedValue({ photos: [], truncated: false });
    ui({ parentMode: true });
    fireEvent.click(await screen.findByRole("radio", { name: /Aninha/ }));
    await waitFor(() => expect(api.fetchKidPhotos).toHaveBeenCalledWith("session-token", "kid-1"));
    const empty = await screen.findByText(/Ainda não encontramos fotos por aqui/);
    expect(empty.textContent).not.toMatch(/consentimento|reconhec|autoriz|bloquead/i);

    api.fetchKidPhotos.mockResolvedValue({ photos: [photo("p9", "e1", "2026-07-11T14:00:00.000Z")], truncated: false });
    fireEvent.click(screen.getByRole("radio", { name: /Todo o álbum/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Aninha/ }));
    expect(await screen.findByText("Fotos encontradas")).toBeInTheDocument();
  });
});

describe("GalleryPage — house rules", () => {
  it("every new album text exists in the four other languages, placeholders kept", () => {
    for (const [pt, row] of Object.entries(GALLERY)) {
      for (const locale of ["en", "es", "fr", "de"] as const) {
        expect({ pt, locale, ok: !!row[locale] }).toEqual({ pt, locale, ok: true });
        expect({ pt, locale, names: (row[locale]!.match(/\{\w+\}/g) ?? []).sort() }).toEqual({ pt, locale, names: (pt.match(/\{\w+\}/g) ?? []).sort() });
      }
    }
  });

  it("no inline styles, no face search by picture, no reduced-motion gap", () => {
    const page = readFileSync(join(__dirname, "GalleryPage.tsx"), "utf8");
    expect(page).not.toMatch(/style=\{|style="/);
    expect(page).not.toMatch(/search-person|getUserMedia|reference/i);
    const scss = readFileSync(join(__dirname, "GalleryPage.module.scss"), "utf8");
    expect(scss).toMatch(/prefers-reduced-motion: reduce/);
  });
});

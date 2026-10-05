import { useEffect, useRef, useState } from "react";
import Dialog from "./Dialog";
import AiVendorLogo from "./AiVendorLogo";
import { AiGlyph } from "./Glyph";
import { aiImage, listAiImageModels, type AiImageModel, type AiImageShape } from "../api/ai";
import { dataUrlToFile } from "../aiImages";
import { uploadImage, type UploadedFile } from "../api/files";
import { useI18n } from "../i18n";

interface AiImageDialogProps {
  open: boolean;
  onClose: () => void;
  token: string;
  /** the picture was rendered and stored; put it in the document */
  onInsert: (file: UploadedFile, caption: string) => void;
  /** seeds the placeholder text (e.g. the document title) */
  suggestion?: string;
}

const SHAPE_IDS: AiImageShape[] = ["wide", "square", "tall"];

const MODEL_KEY = "camping.ai.imageModel";
const MAX_DESC = 1_000;

/**
 * "🎨 Desenhar": the admin describes an illustration, the gateway renders it,
 * and it is stored like any upload before going into the document (optionally
 * inside a <figure> with a caption).
 *
 * Renders take 10–60 s, so the dialog keeps the picture on screen and lets the
 * user try again with a tweaked description before inserting.
 */
export default function AiImageDialog({ open, onClose, token, onInsert, suggestion }: AiImageDialogProps) {
  const { tx, te } = useI18n();
  const [models, setModels] = useState<AiImageModel[]>([]);
  const [model, setModel] = useState(() => localStorage.getItem(MODEL_KEY) ?? "");
  const [description, setDescription] = useState("");
  const [caption, setCaption] = useState("");
  const [shape, setShape] = useState<AiImageShape>("wide");
  const [style, setStyle] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ dataUrl: string; label: string; ms: number } | null>(null);
  const [inserting, setInserting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const shapes = SHAPE_IDS.map((id) => ({
    id,
    label: id === "wide" ? tx("Deitada") : id === "square" ? tx("Quadrada") : tx("Em pé"),
  }));

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listAiImageModels(token)
      .then((r) => {
        if (cancelled) return;
        setModels(r.models);
        setModel((m) => (r.models.some((x) => x.id === m) ? m : (r.models[0]?.id ?? "")));
      })
      .catch(() => {});
    const t = setTimeout(() => areaRef.current?.focus(), 60);
    return () => {
      cancelled = true;
      clearTimeout(t);
      abortRef.current?.abort();
    };
  }, [open, token]);

  useEffect(() => {
    if (model) localStorage.setItem(MODEL_KEY, model);
  }, [model]);

  async function draw() {
    const desc = description.trim();
    if (!desc || busy) return;
    setBusy(true);
    setError(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const img = await aiImage(token, { description: desc, shape, model: model || undefined, style }, ctrl.signal);
      setResult({ dataUrl: img.dataUrl, label: img.label, ms: img.ms });
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") setError(te(err, "Não foi possível gerar a imagem."));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  async function insert() {
    if (!result || inserting) return;
    setInserting(true);
    setError(null);
    try {
      const name = (caption || description).replace(/[^\w-]+/g, "-").slice(0, 40) || "ilustracao";
      const file = await dataUrlToFile(result.dataUrl, name);
      const up = await uploadImage(token, file);
      onInsert(up, caption.trim());
      close();
    } catch (err) {
      setError(te(err, "Não foi possível guardar a imagem."));
    } finally {
      setInserting(false);
    }
  }

  function close() {
    abortRef.current?.abort();
    setResult(null);
    setDescription("");
    setCaption("");
    setError(null);
    onClose();
  }

  const current = models.find((m) => m.id === model);

  return (
    <Dialog open={open} onClose={close} title={tx("Desenhar uma imagem")} width={640} dismissible={!busy && !inserting} fullscreenOnMobile>
      <div className="cat-form cat-form--plain ai-image">
        <h2 className="cat-form__title">
          <AiGlyph /> {tx("Desenhar uma imagem")}
        </h2>
        <label className="cat-field">
          <span className="cat-field__label">{tx("O que aparece no desenho")}</span>
          <textarea
            ref={areaRef}
            className="cat-input cat-input--area"
            rows={3}
            maxLength={MAX_DESC}
            value={description}
            disabled={busy}
            placeholder={
              suggestion
                ? tx('ex.: capa para “{suggestion}” — barracas entre pinheiros ao amanhecer', { suggestion })
                : tx("ex.: crianças em fila na porta de um ônibus escolar, vistas de lado")
            }
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void draw();
              }
            }}
          />
          <p className="cat-hint">{tx("Descreva o que se vê. O desenho não leva letras — se precisar de texto, use a legenda.")}</p>
        </label>

        <div className="ai-image__row">
          <div className="ai-image__shapes" role="group" aria-label={tx("Formato da imagem")}>
            {shapes.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`ai-image__shape ${shape === s.id ? "is-active" : ""}`}
                aria-pressed={shape === s.id}
                disabled={busy}
                onClick={() => setShape(s.id)}
              >
                <span className={`ai-image__frame ai-image__frame--${s.id}`} aria-hidden />
                {s.label}
              </button>
            ))}
          </div>
          {models.length > 1 && (
            <label className="cat-field ai-image__model">
              <span className="cat-field__label">{tx("Desenhista")}</span>
              <span className="ai-image__select">
                <AiVendorLogo vendor={current?.vendor} modelId={current?.id} />
                <select className="cat-input" value={model} disabled={busy} onChange={(e) => setModel(e.target.value)}>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </span>
            </label>
          )}
        </div>

        <label className="ai-image__style">
          <input type="checkbox" checked={style} disabled={busy} onChange={(e) => setStyle(e.target.checked)} />
          <span>{tx("Estilo do acampamento (vetor chapado, cores do app)")}</span>
        </label>

        {busy && <p className="ai-image__waiting ai-pulse">{tx("🎨 Desenhando… leva de 10 a 60 segundos.")}</p>}
        {result && !busy && (
          <figure className={`ai-image__preview ai-image__preview--${shape}`}>
            <img src={result.dataUrl} alt={caption || description} />
            <figcaption>
              {result.label} · {(result.ms / 1000).toFixed(0)} s
            </figcaption>
          </figure>
        )}
        {error && <p className="cat-hint cat-hint--error">⚠️ {error}</p>}

        {result && !busy && (
          <label className="cat-field">
            <span className="cat-field__label">{tx("Legenda (opcional)")}</span>
            <input
              className="cat-input"
              value={caption}
              maxLength={160}
              disabled={inserting}
              placeholder={tx("ex.: Fila de embarque no sábado")}
              onChange={(e) => setCaption(e.target.value)}
            />
          </label>
        )}

        <div className="cat-form__actions">
          <button type="button" className="button button--secondary" disabled={inserting} onClick={() => (busy ? abortRef.current?.abort() : close())}>
            {busy ? tx("Parar") : tx("Cancelar")}
          </button>
          <button type="button" className="button button--secondary" disabled={busy || inserting || !description.trim()} onClick={() => void draw()}>
            {result ? tx("↻ De novo") : tx("🎨 Desenhar")}
          </button>
          <button type="button" className="button button--primary" disabled={!result || busy || inserting} onClick={() => void insert()}>
            {inserting ? tx("Guardando…") : tx("Inserir")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

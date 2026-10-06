import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor } from "@tiptap/react";
import { Extension, Mark, Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { absolutizeFileUrls, fileUrl, relativizeFileUrls, uploadImage, type UploadedFile } from "../api/files";
import { sanitizeForEditor } from "../html";
import AiAssistantPanel from "./AiAssistantPanel";
import AiImageDialog from "./AiImageDialog";
import HtmlSourceEditor from "./HtmlSourceEditor";
import StyleMenu from "./StyleMenu";
import { StyleTokens } from "./StyleTokens";
import type { AiContext } from "../api/ai";
import { useI18n } from "../i18n";
import { AiGlyph } from "./Glyph";

interface RichTextEditorProps {
  /** HTML */
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /**
   * Session token — when given, the 🖼️ button (and paste / drag-and-drop of
   * pictures) uploads to the server and inserts the image.
   */
  token?: string;
  /** big documents: taller editing area with a sticky toolbar */
  tall?: boolean;
  /** what this text is (tells the AI helper who reads it and how it should look) */
  aiContext?: AiContext;
  /** document title, passed to the AI helper as context */
  aiTitle?: string;
  /** fired with the new HTML after the AI helper changes the content */
  onAiApplied?: (html: string) => void;
  /** open the full-screen editor + assistant straight away (needs `token`) */
  autoOpenAi?: boolean;
  /**
   * What "Concluir" does in the full-screen workspace. Default: just close the
   * assistant and go back to the inline editor. Give this to make Concluir
   * SAVE the document — the wording promises it, so nothing is lost.
   */
  onDone?: () => void;
  /** disables Concluir while the save is in flight */
  doneBusy?: boolean;
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** `<mark>` = small rounded pill ("PROMESSA", "📖 Gênesis 15:5"); styled by the reader CSS */
const Chip = Mark.create({
  name: "chip",
  excludes: "chip",
  parseHTML: () => [{ tag: "mark" }],
  renderHTML: ({ HTMLAttributes }) => ["mark", mergeAttributes(HTMLAttributes), 0],
  addCommands() {
    return { toggleChip: () => ({ commands }) => commands.toggleMark(this.name) };
  },
});
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    chip: { toggleChip: () => ReturnType };
  }
}

/**
 * `<figure><img><figcaption>` — a picture with a caption. The image keeps the
 * normal Image node; the caption is editable text.
 */
const Figure = Node.create({
  name: "figure",
  group: "block",
  // the caption is optional: a picture inserted without one stays a plain figure
  content: "image figcaption?",
  draggable: true,
  isolating: true,
  parseHTML: () => [{ tag: "figure" }],
  renderHTML: ({ HTMLAttributes }) => ["figure", mergeAttributes(HTMLAttributes), 0],
});

const Figcaption = Node.create({
  name: "figcaption",
  content: "inline*",
  marks: "bold italic strike link chip",
  parseHTML: () => [{ tag: "figcaption" }],
  renderHTML: ({ HTMLAttributes }) => ["figcaption", mergeAttributes(HTMLAttributes), 0],
});

/**
 * Mirrors RichHtml.tagCallouts inside the editor: a blockquote starting with
 * ✅ / 🔓 / ⚠️ gets data-callout so it shows the same colour the reader will.
 * Decoration only — nothing is written into the document.
 */
const CalloutPreview = Extension.create({
  name: "calloutPreview",
  addProseMirrorPlugins() {
    const key = new PluginKey("calloutPreview");
    const build = (doc: Parameters<typeof DecorationSet.create>[0]) => {
      const decos: Decoration[] = [];
      doc.descendants((node, pos) => {
        if (node.type.name !== "blockquote") return;
        const head = node.textContent.trimStart();
        const kind = head.startsWith("✅") ? "ok" : head.startsWith("🔓") ? "lock" : head.startsWith("⚠") ? "warn" : null;
        if (kind) decos.push(Decoration.node(pos, pos + node.nodeSize, { "data-callout": kind }));
      });
      return DecorationSet.create(doc, decos);
    };
    return [
      new Plugin({
        key,
        state: {
          init: (_, state) => build(state.doc),
          apply: (tr, old) => (tr.docChanged ? build(tr.doc) : old),
        },
        props: { decorations: (state) => key.getState(state) },
      }),
    ];
  },
});

/**
 * WYSIWYG editor (TipTap) limited to what the backend sanitizer accepts:
 * paragraphs, bold/italic/strike, headings 2–3, lists, quote (= callout box),
 * rule, links, pills (<mark>), collapsible sections (<details>) and images
 * (uploaded to /api/files, stored as relative urls).
 */
export default function RichTextEditor({ value, onChange, placeholder, disabled, token, tall, aiContext, aiTitle, onAiApplied, autoOpenAi, onDone, doneBusy }: RichTextEditorProps) {
  const { tx, te } = useI18n();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(!!autoOpenAi && !!token);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [drawOpen, setDrawOpen] = useState(false);
  // kept in a ref so the paste/drop handlers (set up once) always see the latest token
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        code: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Figure,
      Figcaption,
      // small data tables (horários por dia, quarto por monitor…)
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      // open/closed state is saved with the document ("open" attribute)
      Details.configure({ persist: true, openClassName: "is-open" }),
      DetailsSummary,
      DetailsContent,
      Chip,
      StyleTokens,
      CalloutPreview,
      Placeholder.configure({ placeholder: placeholder ?? "Escreva as instruções…" }),
    ],
    // the server stores "/api/files/<id>"; the editor needs absolute urls to render them
    content: sanitizeForEditor(absolutizeFileUrls(value)),
    editable: !disabled,
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : relativizeFileUrls(editor.getHTML())),
    editorProps: {
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])].filter((f) => IMAGE_TYPES.includes(f.type));
        if (!files.length || !tokenRef.current) return false;
        event.preventDefault();
        void insertFiles(files);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = [...(event.dataTransfer?.files ?? [])].filter((f) => IMAGE_TYPES.includes(f.type));
        if (!files.length || !tokenRef.current) return false;
        event.preventDefault();
        void insertFiles(files);
        return true;
      },
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled && !uploading);
  }, [editor, disabled, uploading]);

  // AI workspace: Esc closes, page doesn't scroll behind it
  useEffect(() => {
    if (!aiOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAiOpen(false);
    window.addEventListener("keydown", onKey);
    // scroll lock by class (styles.scss `body.scroll-locked`); an outer lock stays when this one closes
    const wasLocked = document.body.classList.contains("scroll-locked");
    document.body.classList.add("scroll-locked");
    return () => {
      window.removeEventListener("keydown", onKey);
      if (!wasLocked) document.body.classList.remove("scroll-locked");
    };
  }, [aiOpen]);

  async function insertFiles(files: File[]) {
    const t = tokenRef.current;
    if (!editor || !t) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const f of files) {
        const up = await uploadImage(t, f);
        editor.chain().focus().setImage({ src: fileUrl(up.url), alt: up.name }).run();
      }
    } catch (err) {
      setUploadError(te(err, "Não foi possível enviar a imagem."));
    } finally {
      setUploading(false);
    }
  }

  /** a generated (or uploaded) picture goes in as <figure> when it has a caption */
  function insertPicture(file: UploadedFile, caption: string) {
    if (!editor) return;
    const src = fileUrl(file.url);
    const alt = (caption || file.name).replace(/"/g, "&quot;");
    const html = caption
      ? `<figure><img src="${src}" alt="${alt}"><figcaption>${caption.replace(/[<>&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[ch] ?? ch)}</figcaption></figure>`
      : `<img src="${src}" alt="${alt}">`;
    editor.chain().focus().insertContent(html).run();
  }

  if (!editor) return null;

  function setLink() {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Endereço do link (https://…)", prev ?? "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  const btn = (label: React.ReactNode, title: string, active: boolean, run: () => void, extra = "", isDisabled = false) => (
    <button
      type="button"
      className={`rte__btn ${extra} ${active ? "rte__btn--active" : ""}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled || isDisabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {label}
    </button>
  );

  const c = () => editor.chain().focus();

  const editorBox = (
    <div className={`rte ${disabled ? "rte--disabled" : ""} ${tall || aiOpen ? "rte--tall" : ""} ${aiOpen ? "rte--workspace" : ""}`}>
      <div className="rte__bar" role="toolbar" aria-label={tx("Formatação")}>
        {btn("B", tx("Negrito"), editor.isActive("bold"), () => c().toggleBold().run(), "rte__btn--b")}
        {btn("I", tx("Itálico"), editor.isActive("italic"), () => c().toggleItalic().run(), "rte__btn--i")}
        {btn("S", tx("Riscado"), editor.isActive("strike"), () => c().toggleStrike().run(), "rte__btn--s")}
        <span className="rte__sep" />
        {btn("H2", tx("Título"), editor.isActive("heading", { level: 2 }), () => c().toggleHeading({ level: 2 }).run())}
        {btn("H3", tx("Subtítulo"), editor.isActive("heading", { level: 3 }), () => c().toggleHeading({ level: 3 }).run())}
        <span className="rte__sep" />
        {btn("•", tx("Lista"), editor.isActive("bulletList"), () => c().toggleBulletList().run())}
        {btn("1.", tx("Lista numerada"), editor.isActive("orderedList"), () => c().toggleOrderedList().run())}
        {btn("❝", tx("Caixa de destaque (comece com ✅, 🔓 ou ⚠️ para colorir)"), editor.isActive("blockquote"), () => c().toggleBlockquote().run())}
        {btn("—", tx("Linha"), false, () => c().setHorizontalRule().run())}
        <span className="rte__sep" />
        {btn("▸▾", editor.isActive("details") ? tx("Desfazer seção recolhível") : tx("Seção recolhível (título que abre e fecha)"), editor.isActive("details"), () =>
          editor.isActive("details") ? c().unsetDetails().run() : c().setDetails().run(),
        )}
        {btn("🏷️", tx("Etiqueta (pílula colorida)"), editor.isActive("chip"), () => c().toggleChip().run())}
        <span className="rte__sep" />
        <StyleMenu editor={editor} disabled={disabled} />
        {btn("</>", tx("Editar o HTML do documento"), sourceOpen, () => setSourceOpen((v) => !v), "rte__btn--code")}
        {btn("🔗", tx("Link"), editor.isActive("link"), setLink)}
        {token &&
          btn(uploading ? "⏳" : "🖼️", uploading ? tx("Enviando imagem…") : tx("Imagem (ou cole / arraste uma foto)"), false, () => fileInput.current?.click(), "", uploading)}
        {token && btn("🎨", tx("Desenhar uma imagem com IA"), drawOpen, () => setDrawOpen(true))}
        <span className="rte__sep" />
        {btn("↶", tx("Desfazer"), false, () => c().undo().run())}
        {btn("↷", tx("Refazer"), false, () => c().redo().run())}
        {token && (
          <>
            <span className="rte__spacer" />
            {btn(<><AiGlyph /> IA</>, aiOpen ? tx("Fechar assistente de IA") : tx("Assistente de IA"), aiOpen, () => setAiOpen((v) => !v), "rte__btn--ai")}
          </>
        )}
      </div>
      {sourceOpen ? (
        <HtmlSourceEditor
          value={relativizeFileUrls(editor.getHTML())}
          disabled={disabled}
          onCancel={() => setSourceOpen(false)}
          onApply={(html) => {
            editor.chain().focus().setContent(sanitizeForEditor(absolutizeFileUrls(html)), { emitUpdate: true }).run();
            setSourceOpen(false);
          }}
        />
      ) : (
        <EditorContent editor={editor} className="rte__content" />
      )}
      {uploadError && <p className="rte__error">⚠️ {uploadError}</p>}
      {token && (
        <AiImageDialog open={drawOpen} onClose={() => setDrawOpen(false)} token={token} suggestion={aiTitle} onInsert={insertPicture} />
      )}
      {token && (
        <input
          ref={fileInput}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length) void insertFiles(files);
          }}
        />
      )}
    </div>
  );

  if (!aiOpen || !token) return editorBox;

  // Same editor instance, re-parented into a full-screen workspace: editor left, chat right.
  return (
    <>
      <div className="rte rte--placeholder" aria-hidden="true">
        <p><AiGlyph /> {tx("Editando com o assistente…")}</p>
      </div>
      {createPortal(
        <div className="ai-workspace" role="dialog" aria-modal="true" aria-label={tx("Editor com assistente de IA")}>
          <header className="ai-workspace__head">
            <span className="ai-workspace__title"><AiGlyph /> {aiTitle?.trim() || tx("Editor com assistente")}</span>
            <button
              type="button"
              className="button button--secondary ai-workspace__done"
              title={onDone ? tx("Salvar o texto e fechar") : tx("Fechar o assistente")}
              disabled={doneBusy}
              onClick={() => (onDone ? onDone() : setAiOpen(false))}
            >
              {doneBusy ? tx("Salvando…") : tx("Concluir")}
            </button>
          </header>
          <div className="ai-workspace__body">
            <div className="ai-workspace__editor">{editorBox}</div>
            <AiAssistantPanel open onClose={() => setAiOpen(false)} editor={editor} token={token} context={aiContext} title={aiTitle} onApplied={onAiApplied} />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

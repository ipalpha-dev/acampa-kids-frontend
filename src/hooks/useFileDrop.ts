import { useCallback, useEffect, useRef, useState } from "react";

/** Extensions the spreadsheet imports accept — same list as the file inputs. */
const SPREADSHEET_EXTENSIONS = [".csv", ".xls", ".xlsx"];

function isSpreadsheet(file: File): boolean {
  const name = file.name.toLowerCase();
  return SPREADSHEET_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/** In-memory handoff from the empty list drop zone to the import page (File can't live in the hash). Kept until the import page leaves so StrictMode remounts still see it. */
let pendingImportFile: File | null = null;

export function setPendingImportFile(file: File | null): void {
  pendingImportFile = file;
}

export function peekPendingImportFile(): File | null {
  return pendingImportFile;
}

interface FileDrop {
  /** true while a file is hovering over the zone — for the "solte aqui" styling */
  dragging: boolean;
  /** spread onto the drop zone element */
  handlers: {
    onDragOver: (e: React.DragEvent) => void;
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
}

/**
 * Lets a zone accept a dropped spreadsheet (.csv / .xls / .xlsx). Non-matching
 * files are ignored so a stray image never enters the import. `onFile` gets the
 * first valid file dropped.
 */
export function useFileDrop(onFile: (file: File) => void, accept: (file: File) => boolean = isSpreadsheet): FileDrop {
  const [dragging, setDragging] = useState(false);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }, []);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // only clear when the pointer actually leaves the zone, not a child
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = Array.from(e.dataTransfer?.files ?? []).find(accept);
      if (file) onFile(file);
    },
    [onFile, accept],
  );

  return { dragging, handlers: { onDragOver, onDragEnter, onDragLeave, onDrop } };
}

function hasFiles(e: DragEvent): boolean {
  return !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
}

/**
 * Same as `useFileDrop`, but the whole window is the zone. Used on an empty
 * staff/campers list so a drop anywhere (toolbar, padding, chrome) opens import
 * instead of the browser navigating to the file.
 */
export function useWindowFileDrop(onFile: (file: File) => void, enabled: boolean, accept: (file: File) => boolean = isSpreadsheet): boolean {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const onFileRef = useRef(onFile);
  const acceptRef = useRef(accept);
  onFileRef.current = onFile;
  acceptRef.current = accept;

  useEffect(() => {
    if (!enabled) {
      depth.current = 0;
      setDragging(false);
      return;
    }
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = "copy";
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      const file = Array.from(e.dataTransfer?.files ?? []).find(acceptRef.current);
      if (file) onFileRef.current(file);
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
      depth.current = 0;
      setDragging(false);
    };
  }, [enabled]);

  return dragging;
}

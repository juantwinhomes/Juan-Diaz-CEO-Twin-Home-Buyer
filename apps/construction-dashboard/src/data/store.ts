// Loads and saves the property model.
//
// Order of truth:
//   1. Published artifact: the shared database, collection "properties"
//      (one document per property, id = property id) + doc "meta/dataset".
//      Claude writes Monday updates straight into these documents, and every
//      open view updates live — no rebuild needed.
//   2. Anywhere the database is unavailable (local dev server, previews):
//      public/data/properties.json, with edits kept in this browser's
//      localStorage so a refresh does not erase them.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dataset, Property } from "./types";
import { accentOf } from "../theme/palette";

type Snap = { docs: { id: string; exists: boolean; data(): Record<string, unknown> | undefined }[] };
type DocRef = { set(d: Record<string, unknown>): Promise<void>; onSnapshot(n: (s: { exists: boolean; data(): Record<string, unknown> | undefined }) => void, e?: (err: { code: string }) => void): () => void };
type DB = {
  doc(path: string): DocRef;
  collection(path: string): { onSnapshot(n: (s: Snap) => void, e?: (err: { code: string }) => void): () => void };
};
declare global {
  interface Window { claude?: { use?(name: string): Promise<unknown> } }
}

export type Mode = "loading" | "live" | "local" | "error";
const LS_KEY = "construction-control.edits.v1";

const readLocal = (): Record<string, Property> => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
};
const writeLocal = (m: Record<string, Property>) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(m)); } catch { /* storage blocked: edits last this session */ }
};

const sortProps = (ps: Property[]) =>
  ps.slice().sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.address.localeCompare(b.address));

export function useDataset() {
  const [seed, setSeed] = useState<Dataset | null>(null);
  const [live, setLive] = useState<Property[] | null>(null);
  const [meta, setMeta] = useState<Partial<Dataset> | null>(null);
  const [local, setLocal] = useState<Record<string, Property>>(() => readLocal());
  const [mode, setMode] = useState<Mode>("loading");
  const [note, setNote] = useState("");
  const dbRef = useRef<DB | null>(null);

  useEffect(() => {
    fetch("data/properties.json", { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((d: Dataset) => setSeed(d))
      .catch(() => { setNote("Could not load data/properties.json."); });
  }, []);

  useEffect(() => {
    let unsubs: (() => void)[] = [];
    let cancelled = false;
    const use = window.claude?.use;
    if (!use) { setMode("local"); return; }
    use.call(window.claude, "db").then((db) => {
      if (cancelled) return;
      if (!db) { setMode("local"); return; }
      dbRef.current = db as DB;
      const onErr = (e: { code: string }) => {
        setMode("error");
        setNote(e.code === "revoked" ? "Saving ended for this view — changes stay on this screen." : "Lost the live connection — reload to reconnect.");
      };
      unsubs.push((db as DB).collection("properties").onSnapshot((snap) => {
        const ps = snap.docs.filter((d) => d.exists).map((d) => d.data() as unknown as Property);
        setLive(ps.length ? sortProps(ps) : null);
        setMode("live");
      }, onErr));
      unsubs.push((db as DB).doc("meta/dataset").onSnapshot((s) => {
        setMeta(s.exists ? (s.data() as Partial<Dataset>) : null);
      }, onErr));
    });
    return () => { cancelled = true; unsubs.forEach((u) => u()); unsubs = []; };
  }, []);

  // A property document in the shared store (or a local edit) replaces the
  // seed copy of the same id; ids that exist only there are added.
  const overlay = (base: Property[], over: Property[]) =>
    base.map((p) => over.find((o) => o.id === p.id) ?? p).concat(over.filter((o) => !base.some((p) => p.id === o.id)));
  const merged = sortProps(mode === "live"
    ? overlay(seed?.properties ?? [], live ?? [])
    : overlay(seed?.properties ?? [], Object.values(local)));
  // Every property carries a permanent accent; one without a stored color gets
  // the next free palette color, which is written back on its next save.
  const properties = merged.map((p) => (p.accentColor ? p : { ...p, accentColor: accentOf(p, merged) }));

  const saveProperty = useCallback(async (p: Property) => {
    const db = dbRef.current;
    if (db && mode === "live") {
      // JSON round-trip drops undefined fields, which the store rejects.
      try { await db.doc(`properties/${p.id}`).set(JSON.parse(JSON.stringify(p))); return true; }
      catch { setNote("Could not save that change for the team. It was not stored."); return false; }
    }
    setLocal((m) => { const next = { ...m, [p.id]: p }; writeLocal(next); return next; });
    return true;
  }, [mode]);

  const resetLocal = useCallback(() => { writeLocal({}); setLocal({}); }, []);

  return {
    properties,
    asOf: meta?.asOf ?? seed?.asOf ?? "",
    sources: meta?.sources ?? seed?.sources ?? [],
    mode, note, saveProperty, resetLocal,
    localEdits: Object.keys(local).length,
    ready: !!(live || seed),
  };
}

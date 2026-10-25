// Shape-agnostic mapping between a state object and per-collection rows.
// Arrays of records with unique string ids become collections; every other top-level key is meta.
export type Entry = { data: string; position: number };
export type Snapshot = {
  collections: Map<string, Map<string, Entry>>;
  meta: Map<string, string>;
};
export type Upsert = { collection: string; id: string } & Entry;
export type StateDiff = {
  created: string[];
  dropped: string[];
  upserts: Upsert[];
  deletes: { collection: string; id: string }[];
  meta: { key: string; data: string }[];
  metaDeletes: string[];
};

export const emptySnapshot = (): Snapshot => ({
  collections: new Map(),
  meta: new Map(),
});
export const validKey = (key: string) => /^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(key);
export const isEmptyDiff = (d: StateDiff) =>
  !d.created.length &&
  !d.dropped.length &&
  !d.upserts.length &&
  !d.deletes.length &&
  !d.meta.length &&
  !d.metaDeletes.length;

function records(value: unknown): { id: string }[] | undefined {
  if (!Array.isArray(value)) return;
  const ids = new Set<string>();
  for (const item of value) {
    const id = (item as { id?: unknown } | null)?.id;
    if (typeof item !== "object" || typeof id !== "string" || ids.has(id))
      return;
    ids.add(id);
  }
  return value;
}

// Indexes (into `positions`) of a longest strictly increasing subsequence.
function increasing(positions: (number | undefined)[]) {
  const tails: number[] = [];
  const previous = new Array<number>(positions.length).fill(-1);
  positions.forEach((p, i) => {
    if (p === undefined) return;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (positions[tails[mid]]! < p) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) previous[i] = tails[lo - 1];
    tails[lo] = i;
  });
  const kept = new Set<number>();
  for (let i = tails.at(-1) ?? -1; i >= 0; i = previous[i]) kept.add(i);
  return kept;
}

// Keeps stored positions for items whose relative order is unchanged; only new/moved items get new ones.
function place(prev: Map<string, Entry>, items: { id: string }[]) {
  const old = items.map((item) => prev.get(item.id)?.position);
  const kept = increasing(old);
  const upper = new Array<number | undefined>(items.length);
  for (let i = items.length - 1, next: number | undefined; i >= 0; i--) {
    upper[i] = next;
    if (kept.has(i)) next = old[i];
  }
  const positions: number[] = [];
  let last: number | undefined;
  for (let i = 0; i < items.length; i++) {
    let p: number;
    if (kept.has(i)) p = old[i]!;
    else if (upper[i] === undefined) p = last === undefined ? 0 : last + 1;
    else if (last === undefined) p = upper[i]! - 1;
    else p = (last + upper[i]!) / 2;
    if (last !== undefined && !(p > last)) return items.map((_, j) => j);
    positions.push((last = p));
  }
  return positions;
}

export function diffState(
  prev: Snapshot,
  next: object,
): { diff: StateDiff; snapshot: Snapshot } {
  const diff: StateDiff = {
    created: [],
    dropped: [],
    upserts: [],
    deletes: [],
    meta: [],
    metaDeletes: [],
  };
  const snapshot = emptySnapshot();
  for (const [key, value] of Object.entries(next)) {
    if (!validKey(key)) throw new Error(`Unsupported state key "${key}".`);
    if (value === undefined) continue;
    const items = records(value);
    if (!items) {
      const data = JSON.stringify(value);
      snapshot.meta.set(key, data);
      if (prev.meta.get(key) !== data) diff.meta.push({ key, data });
      continue;
    }
    const before = prev.collections.get(key);
    if (!before) diff.created.push(key);
    const rows = before ?? new Map<string, Entry>();
    const positions = place(rows, items);
    const after = new Map<string, Entry>();
    items.forEach((item, i) => {
      const entry = { data: JSON.stringify(item), position: positions[i] };
      const old = rows.get(item.id);
      after.set(item.id, entry);
      if (old?.data !== entry.data || old.position !== entry.position)
        diff.upserts.push({ collection: key, id: item.id, ...entry });
    });
    for (const id of rows.keys())
      if (!after.has(id)) diff.deletes.push({ collection: key, id });
    snapshot.collections.set(key, after);
  }
  for (const key of prev.collections.keys())
    if (!snapshot.collections.has(key)) diff.dropped.push(key);
  for (const key of prev.meta.keys())
    if (!snapshot.meta.has(key)) diff.metaDeletes.push(key);
  return { diff, snapshot };
}

export function stateOf(snapshot: Snapshot): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  for (const [key, rows] of snapshot.collections)
    state[key] = [...rows.values()]
      .sort((a, b) => a.position - b.position)
      .map((row) => JSON.parse(row.data));
  for (const [key, data] of snapshot.meta) state[key] = JSON.parse(data);
  return state;
}

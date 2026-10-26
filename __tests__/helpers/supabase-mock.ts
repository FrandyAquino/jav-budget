// In-memory stand-in for the Supabase client used by src/features/sync:
// email OTP auth plus sync_records / sync_meta with the server's
// last-write-wins trigger and increasing server_updated_at stamps.
type Row = Record<string, unknown>;
type Listener = (event: string, session: unknown) => void;

export const VALID_CODE = "123456";
export const USER = { id: "user-1", email: "ana@example.com" };
const SESSION = { access_token: "token", user: USER };

let clock = 0;
const stamp = () => new Date(Date.UTC(2026, 9, 25, 10, 0, 0, ++clock)).toISOString();

export const server = {
  session: null as typeof SESSION | null,
  tables: { sync_records: new Map<string, Row>(), sync_meta: new Map<string, Row>() },
  receipts: new Set<string>(), // "<user id>/<file>"
  listeners: new Set<Listener>(),
  reset() {
    this.session = null;
    this.tables.sync_records.clear();
    this.tables.sync_meta.clear();
    this.receipts.clear();
    this.listeners.clear();
    client.rpc.mockClear();
    for (const fn of Object.values(auth)) if (typeof fn === "function" && "mockClear" in fn) (fn as jest.Mock).mockClear();
  },
  signIn() {
    this.session = SESSION;
  },
  // A change made by another device.
  put(table: "sync_records" | "sync_meta", row: Row) {
    write(table, { user_id: USER.id, ...row });
  },
};
const keyOf = (table: string, row: Row) =>
  table === "sync_records" ? `${row.user_id}/${row.collection}/${row.id}` : `${row.user_id}/${row.key}`;
function write(table: "sync_records" | "sync_meta", row: Row) {
  const map = server.tables[table];
  const key = keyOf(table, row);
  const old = map.get(key);
  // BEFORE trigger: older client writes lose.
  if (old && Date.parse(String(row.client_updated_at)) < Date.parse(String(old.client_updated_at))) return;
  map.set(key, { position: 0, deleted: false, ...old, ...row, server_updated_at: stamp() });
}
const emit = (event: string) => {
  for (const listener of server.listeners) listener(event, server.session);
};

const auth = {
  getSession: jest.fn(async () => ({ data: { session: server.session }, error: null })),
  signInWithOtp: jest.fn(async (_: { email: string; options?: object }) => ({ data: {}, error: null })),
  verifyOtp: jest.fn(async ({ token }: { email: string; token: string; type: string }) => {
    if (token !== VALID_CODE)
      return {
        data: { session: null, user: null },
        error: { name: "AuthApiError", code: "otp_expired", status: 403, message: "Token has expired or is invalid" },
      };
    server.session = SESSION;
    void Promise.resolve().then(() => emit("SIGNED_IN"));
    return { data: { session: SESSION, user: USER }, error: null };
  }),
  signOut: jest.fn(async (_?: object) => {
    server.session = null;
    void Promise.resolve().then(() => emit("SIGNED_OUT"));
    return { error: null };
  }),
  onAuthStateChange: jest.fn((listener: Listener) => {
    server.listeners.add(listener);
    void Promise.resolve().then(() => listener("INITIAL_SESSION", server.session));
    return { data: { subscription: { unsubscribe: () => server.listeners.delete(listener) } } };
  }),
  startAutoRefresh: jest.fn(async () => {}),
  stopAutoRefresh: jest.fn(async () => {}),
};

class Query implements PromiseLike<{ data: Row[]; error: null }> {
  private filters: ((row: Row) => boolean)[] = [];
  private max = Infinity;
  constructor(private table: "sync_records" | "sync_meta") {}
  select() {
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  // Only the keyset form built by afterCursor(): rows after the cursor time.
  or(filter: string) {
    const at = /server_updated_at\.gt\."([^"]+)"/.exec(filter)?.[1] ?? "";
    this.filters.push((row) => Date.parse(String(row.server_updated_at)) > Date.parse(at));
    return this;
  }
  order() {
    return this;
  }
  limit(count: number) {
    this.max = count;
    return this;
  }
  then<A, B>(resolve?: (value: { data: Row[]; error: null }) => A | PromiseLike<A>, reject?: (reason: unknown) => B | PromiseLike<B>) {
    const rows = [...server.tables[this.table].values()]
      .filter((row) => this.filters.every((f) => f(row)))
      .sort((a, b) => String(a.server_updated_at).localeCompare(String(b.server_updated_at)))
      .slice(0, this.max)
      .map((row) => JSON.parse(JSON.stringify(row)));
    return Promise.resolve({ data: rows, error: null as null }).then(resolve, reject);
  }
}

export const client = {
  auth,
  from: (table: "sync_records" | "sync_meta") => ({
    select: () => new Query(table),
    upsert: jest.fn(async (rows: Row[]) => {
      if (!server.session) return { error: { message: "JWT expired", status: 401 } };
      for (const row of rows) write(table, JSON.parse(JSON.stringify(row)));
      return { error: null };
    }),
  }),
  // delete_account: the user's rows cascade.
  rpc: jest.fn(async (name: string) => {
    if (name !== "delete_account" || !server.session) return { data: null, error: { message: "Not allowed", status: 401 } };
    for (const map of Object.values(server.tables))
      for (const [key, row] of map) if (row.user_id === USER.id) map.delete(key);
    return { data: null, error: null };
  }),
  storage: {
    from: () => ({
      upload: jest.fn(async (path: string) => {
        server.receipts.add(path);
        return { data: {}, error: null };
      }),
      createSignedUrl: jest.fn(async () => ({ data: null, error: { message: "Not found" } })),
      list: jest.fn(async (folder: string, options?: { limit?: number }) => ({
        data: [...server.receipts]
          .filter((path) => path.startsWith(`${folder}/`))
          .slice(0, options?.limit ?? 100)
          .map((path) => ({ name: path.slice(folder.length + 1) })),
        error: null,
      })),
      remove: jest.fn(async (paths: string[]) => {
        const removed = paths.filter((path) => server.receipts.delete(path));
        return { data: removed.map((name) => ({ name })), error: null };
      }),
    }),
  },
};
export const records = () => [...server.tables.sync_records.values()];
export const meta = () => [...server.tables.sync_meta.values()];

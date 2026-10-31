import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import { getLanguage, subscribeLanguage, t } from "@/shared/i18n/core";
import {
  emptyState,
  processRecurring,
  pruneStarterCategoriesOnce,
  type Account,
  type Category,
  type FinanceState,
  type Settings,
} from "./model";
import { parseState } from "./schema";
import { syncReminders } from "./device";
import {
  discardUnreadableData,
  subscribe,
  transact,
} from "./storage/backend";
import { isUnreadableData } from "./storage/shared";
import { registerBackgroundProcessing } from "./storage/background";
import { sweepReceipts } from "@/features/transactions/receipts";
import { canAccessLedger, getSyncStatus, useSyncStatus } from "@/features/sync/status";
import { whenFirstPull, whenIdle } from "@/features/sync/engine";

type FinanceData = {
  state: FinanceState;
  ready: boolean;
  loadError: string;
  // The stored data is unreadable but a copy is kept: offer to start empty.
  canStartEmpty: boolean;
};
// Stable for the provider's lifetime: reading them never re-renders.
type FinanceActions = {
  startEmpty: () => void;
  setNotice: (message: string) => void;
  update: (change: (current: FinanceState) => FinanceState) => Promise<void>;
  retry: () => void;
};
type Lookups = {
  categories: ReadonlyMap<string, Category>;
  accounts: ReadonlyMap<string, Account>;
};
// Split so a toast, or a write elsewhere in the ledger, only re-renders the
// components that read what changed.
const DataContext = createContext<FinanceData | null>(null);
const ActionsContext = createContext<FinanceActions | null>(null);
const NoticeContext = createContext("");
const AppearanceContext = createContext<Settings["appearance"]>("system");
const LookupsContext = createContext<Lookups>({
  categories: new Map(),
  accounts: new Map(),
});

type Collection = Exclude<
  keyof FinanceState,
  "version" | "starterPruned" | "settings"
>;
const collections: Collection[] = [
  "accounts",
  "categories",
  "transactions",
  "budgets",
  "monthlyBudgets",
  "recurring",
  "goals",
];
function sameRecords<T extends { id: string }>(
  previous: readonly T[],
  next: T[],
): T[] {
  if (previous === next) return next;
  const byId = new Map(previous.map((r) => [r.id, r]));
  let unchanged = previous.length === next.length;
  const merged = next.map((record, index) => {
    const old = byId.get(record.id);
    const kept =
      old && JSON.stringify(old) === JSON.stringify(record) ? old : record;
    if (kept !== previous[index]) unchanged = false;
    return kept;
  });
  return unchanged ? (previous as T[]) : merged;
}
// parseState rebuilds every record; keep the previous objects (and arrays)
// when their content is equal so memoized rows and selectors can skip work.
function keepIdentity(
  previous: FinanceState,
  next: FinanceState,
): FinanceState {
  if (previous === next) return next;
  const result = { ...next };
  for (const key of collections)
    (result[key] as { id: string }[]) = sameRecords(
      previous[key] as { id: string }[],
      next[key] as { id: string }[],
    );
  if (JSON.stringify(previous.settings) === JSON.stringify(next.settings))
    result.settings = previous.settings;
  return result;
}
export function FinanceProvider({ children }: { children: ReactNode }) {
  const accessible = canAccessLedger(useSyncStatus());
  const [state, setState] = useState<FinanceState>(emptyState);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [canStartEmpty, setCanStartEmpty] = useState(false);
  const [notice, setNotice] = useState("");
  const current = useRef(state);
  const queue = useRef(Promise.resolve());
  const reminders = useRef(Promise.resolve());
  // Reminder texts are localized when scheduled; reschedule on language change.
  const language = useSyncExternalStore(
    subscribeLanguage,
    getLanguage,
    getLanguage,
  );
  const commit = useCallback((next: FinanceState) => {
    current.current = keepIdentity(current.current, next);
    setState(current.current);
  }, []);
  const update = useCallback(
    (change: (current: FinanceState) => FinanceState) => {
      const owner = getSyncStatus().user?.id;
      const task = queue.current.then(async () => {
        const next = await transact((base) => {
          if (!canAccessLedger() || getSyncStatus().user?.id !== owner)
            throw new Error(t("auth.required"));
          return parseState(change(base ?? current.current));
        }, { owner });
        commit(next);
      });
      queue.current = task.catch(() => {});
      return task;
    },
    [commit],
  );
  const load = useCallback(
    // Nothing stored yet (first launch): start empty with onboarded=false;
    // AppShell shows the onboarding flow until it is completed.
    (initial: () => FinanceState = emptyState) =>
      transact((base) =>
        parseState(pruneStarterCategoriesOnce(base ?? initial())),
      )
        .then((next) => {
          commit(next);
          setLoadError("");
          setCanStartEmpty(false);
          setReady(true);
          // Photos left behind by deleted transactions (best effort, native).
          sweepReceipts(next);
        })
        .catch((error: unknown) => {
        setCanStartEmpty(isUnreadableData(error));
        setLoadError(
          t("store.loadError", {
            detail:
              error instanceof Error ? error.message : t("store.pleaseRetry"),
          }),
        );
      }),
    [commit],
  );
  // Due recurring entries are generated only after this session's first
  // cloud pull (and any sync in flight), so a stale local copy can't undo
  // remote edits, e.g. re-activate a subscription paused on another device.
  const processRecurringAfterSync = useCallback(async () => {
    await whenFirstPull();
    // SyncAgent requests a sync on the same foreground event; listeners run
    // synchronously, so after a tick that cycle is in flight. Let it land.
    await Promise.resolve();
    await whenIdle();
    await update(processRecurring);
  }, [update]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(
    () =>
      subscribe(
        commit,
        () =>
          setNotice(t("store.otherTab")),
      ),
    [commit],
  );
  useEffect(() => {
    if (ready) void registerBackgroundProcessing().catch(() => {});
  }, [ready]);
  useEffect(() => {
    if (!ready || !accessible) return;
    void processRecurringAfterSync().catch(() =>
      setNotice(t("store.recurringFailed")),
    );
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active")
        void processRecurringAfterSync().catch(() =>
          setNotice(t("store.recurringFailed")),
        );
    });
    return () => subscription.remove();
  }, [ready, processRecurringAfterSync, accessible]);
  useEffect(() => {
    if (!ready || !accessible) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const midnight = new Date();
      midnight.setHours(24, 0, 1, 0);
      timer = setTimeout(() => {
        void processRecurringAfterSync().catch(() =>
          setNotice(t("store.scheduledFailed")),
        );
        schedule();
      }, midnight.valueOf() - Date.now());
    };
    schedule();
    return () => clearTimeout(timer);
  }, [ready, processRecurringAfterSync, accessible]);
  useEffect(() => {
    if (!ready) return;
    reminders.current = reminders.current
      .then(() => syncReminders(accessible ? state : emptyState()))
      .catch(() =>
        setNotice(t("store.remindersFailed")),
      );
  }, [ready, state, language, accessible]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(timeout);
  }, [notice]);
  const startEmpty = useCallback(() => {
    void discardUnreadableData()
      .then(() => load(emptyState))
      .catch((error: unknown) =>
        setLoadError(
          t("store.startEmptyFailed", {
            detail: error instanceof Error ? error.message : "",
          }),
        ),
      );
  }, [load]);
  const retry = useCallback(() => {
    void load();
  }, [load]);
  const data = useMemo(
    () => ({ state, ready, loadError, canStartEmpty }),
    [state, ready, loadError, canStartEmpty],
  );
  const actions = useMemo(
    () => ({ startEmpty, setNotice, update, retry }),
    [startEmpty, update, retry],
  );
  const { categories, accounts } = state;
  const lookups = useMemo(
    () => ({
      categories: new Map(categories.map((c) => [c.id, c])),
      accounts: new Map(accounts.map((a) => [a.id, a])),
    }),
    [categories, accounts],
  );
  return (
    <ActionsContext.Provider value={actions}>
      <DataContext.Provider value={data}>
        <AppearanceContext.Provider value={state.settings.appearance}>
          <LookupsContext.Provider value={lookups}>
            <NoticeContext.Provider value={notice}>
              {children}
            </NoticeContext.Provider>
          </LookupsContext.Provider>
        </AppearanceContext.Provider>
      </DataContext.Provider>
    </ActionsContext.Provider>
  );
}
// Ledger data plus the stable actions. Re-renders on every ledger write but
// not on toasts; read the notice with useNotice().
export function useFinance() {
  return { ...useFinanceState(), ...useFinanceActions() };
}
export function useFinanceState() {
  const context = useContext(DataContext);
  if (!context) throw new Error("FinanceProvider is missing.");
  return context;
}
export function useFinanceActions() {
  const context = useContext(ActionsContext);
  if (!context) throw new Error("FinanceProvider is missing.");
  return context;
}
// The toast text currently shown ("" when none).
export function useNotice() {
  return useContext(NoticeContext);
}
// Changes only when the appearance setting does (theme reads this).
export function useAppearance() {
  return useContext(AppearanceContext);
}
// Categories and accounts by id; a new value only when either list changes.
export function useLookups() {
  return useContext(LookupsContext);
}

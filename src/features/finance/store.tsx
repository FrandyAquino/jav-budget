import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  type FinanceState,
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

type Store = {
  state: FinanceState;
  ready: boolean;
  loadError: string;
  // The stored data is unreadable but a copy is kept: offer to start empty.
  canStartEmpty: boolean;
  startEmpty: () => void;
  notice: string;
  setNotice: (message: string) => void;
  update: (change: (current: FinanceState) => FinanceState) => Promise<void>;
  retry: () => void;
};
const Context = createContext<Store | null>(null);
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
  const update = useCallback(
    (change: (current: FinanceState) => FinanceState) => {
      const owner = getSyncStatus().user?.id;
      const task = queue.current.then(async () => {
        const next = await transact((base) => {
          if (!canAccessLedger() || getSyncStatus().user?.id !== owner)
            throw new Error(t("auth.required"));
          return parseState(change(base ?? current.current));
        }, { owner });
        current.current = next;
        setState(next);
      });
      queue.current = task.catch(() => {});
      return task;
    },
    [],
  );
  const load = useCallback(
    // Nothing stored yet (first launch): start empty with onboarded=false;
    // AppShell shows the onboarding flow until it is completed.
    (initial: () => FinanceState = emptyState) =>
      transact((base) =>
        parseState(
          pruneStarterCategoriesOnce(processRecurring(base ?? initial())),
        ),
      )
        .then((next) => {
          current.current = next;
          setState(next);
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
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(
    () =>
      subscribe(
        (next) => {
          current.current = next;
          setState(next);
        },
        () =>
          setNotice(t("store.otherTab")),
      ),
    [],
  );
  useEffect(() => {
    if (ready) void registerBackgroundProcessing().catch(() => {});
  }, [ready]);
  useEffect(() => {
    if (!ready || !accessible) return;
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active")
        void update(processRecurring).catch(() =>
          setNotice(t("store.recurringFailed")),
        );
    });
    return () => subscription.remove();
  }, [ready, update, accessible]);
  useEffect(() => {
    if (!ready || !accessible) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const midnight = new Date();
      midnight.setHours(24, 0, 1, 0);
      timer = setTimeout(() => {
        void update(processRecurring).catch(() =>
          setNotice(t("store.scheduledFailed")),
        );
        schedule();
      }, midnight.valueOf() - Date.now());
    };
    schedule();
    return () => clearTimeout(timer);
  }, [ready, update, accessible]);
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
  return (
    <Context.Provider
      value={{
        state,
        ready,
        loadError,
        canStartEmpty,
        startEmpty: () => {
          void discardUnreadableData()
            .then(() => load(emptyState))
            .catch((error: unknown) =>
              setLoadError(
                t("store.startEmptyFailed", {
                  detail: error instanceof Error ? error.message : "",
                }),
              ),
            );
        },
        notice,
        setNotice,
        update,
        retry: () => {
          void load();
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useFinance() {
  const context = useContext(Context);
  if (!context) throw new Error("FinanceProvider is missing.");
  return context;
}

import { useState } from "react";
import { Action, FormError, Sheet } from "@/shared/ui";
import { useT } from "@/shared/i18n/react";
import { resolveDecision, type DecisionChoice } from "./engine";
import { useSyncStatus } from "./status";

// The one-time question before the first sync with an account (merge,
// account switch, or sample data on this device).
export function SyncDecisionSheet({ onClose }: { onClose: () => void }) {
  const { decision, user, error } = useSyncStatus();
  const { t } = useT();
  const [busy, setBusy] = useState<DecisionChoice>();
  if (!decision) return null;
  const choose = (choice: DecisionChoice) => {
    setBusy(choice);
    void resolveDecision(choice).finally(() => {
      setBusy(undefined);
      onClose();
    });
  };
  const title =
    decision.kind === "merge"
      ? t("sync.merge.title")
      : decision.kind === "switch"
        ? t("sync.switch.title")
        : t("sync.demo.title");
  const body =
    decision.kind === "merge"
      ? t("sync.merge.body")
      : decision.kind === "switch"
        ? t("sync.switch.body", { email: user?.email ?? "" })
        : t("sync.demo.body");
  return (
    <Sheet title={title} subtitle={body} onClose={onClose}>
      {decision.kind === "merge" ? (
        <>
          <Action loading={busy === "merge"} disabled={!!busy} onPress={() => choose("merge")}>
            {t("sync.merge.merge")}
          </Action>
          <Action secondary loading={busy === "replace"} disabled={!!busy} onPress={() => choose("replace")}>
            {t("sync.merge.replace")}
          </Action>
        </>
      ) : decision.kind === "switch" ? (
        <Action danger loading={busy === "replace"} disabled={!!busy} onPress={() => choose("replace")}>
          {t("sync.switch.replace")}
        </Action>
      ) : (
        <>
          <Action loading={busy === "replace"} disabled={!!busy} onPress={() => choose("replace")}>
            {decision.remoteHasData ? t("sync.demo.useCloud") : t("sync.demo.startFresh")}
          </Action>
          <Action secondary loading={busy === "keepDemo"} disabled={!!busy} onPress={() => choose("keepDemo")}>
            {t("sync.demo.keep")}
          </Action>
        </>
      )}
      <FormError message={error ? t(`account.error.${error}`) : ""} />
      <Action secondary disabled={!!busy} onPress={() => choose("cancel")}>
        {t("sync.cancel")}
      </Action>
    </Sheet>
  );
}

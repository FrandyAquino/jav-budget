import { useState } from "react";
import { Action, Card, Section, Sheet, Txt, useTheme } from "@/shared/ui";
import { useT } from "@/shared/i18n/react";
import { useFinance } from "@/features/finance/store";
import { requestSync, signOut } from "@/features/sync/engine";
import { SignInForm } from "@/features/sync/SignInForm";
import { SyncDecisionSheet } from "@/features/sync/SyncDecisionSheet";
import { useSyncStatus } from "@/features/sync/status";

// Optional account: signing in turns on cloud sync and cloud backup.
export function AccountSection({ onReplaced }: { onReplaced: () => void }) {
  const status = useSyncStatus();
  const { state } = useFinance();
  const { colors } = useTheme();
  const { t, date } = useT();
  const [deciding, setDeciding] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const header = <Section title={t("account.title")} subtitle={t("account.subtitle")} />;
  if (!status.configured)
    return (
      <Card style={{ gap: 12 }}>
        {header}
        <Txt size={13} color={colors.muted}>
          {t("account.notConfigured")}
        </Txt>
      </Card>
    );
  if (!status.ready) return <Card style={{ gap: 12 }}>{header}</Card>;
  if (!status.user)
    return (
      <Card style={{ gap: 16 }}>
        {header}
        <SignInForm />
        <Txt size={12} color={colors.muted}>
          {t("account.privacy")}
        </Txt>
      </Card>
    );
  const syncing = status.phase === "syncing";
  const statusText = t(`account.status.${status.phase}`);
  const last = status.lastSyncedAt
    ? t("account.lastSynced", {
        time: date(status.lastSyncedAt, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
      })
    : t("account.neverSynced");
  return (
    <>
      <Card style={{ gap: 16 }}>
        {header}
        <Txt weight="500">{t("account.signedInAs", { email: status.user.email })}</Txt>
        <Txt
          size={13}
          accessibilityLiveRegion="polite"
          color={status.phase === "error" ? colors.danger : colors.muted}
        >
          {`${statusText} · ${last}`}
        </Txt>
        {status.phase === "error" && status.error ? (
          <Txt size={13} color={colors.danger}>
            {t(`account.error.${status.error}`)}
          </Txt>
        ) : null}
        {state.demo && !status.decision ? (
          <Txt size={13} color={colors.muted}>
            {t("account.demoPaused")}
          </Txt>
        ) : null}
        {status.decision ? (
          <Action onPress={() => setDeciding(true)}>{t("account.reviewDecision")}</Action>
        ) : (
          <Action
            secondary
            loading={syncing}
            disabled={state.demo}
            onPress={() => void requestSync()}
          >
            {t("account.syncNow")}
          </Action>
        )}
        <Action secondary onPress={() => setSigningOut(true)}>
          {t("account.signOut")}
        </Action>
        <Txt size={12} color={colors.muted}>
          {t("account.privacy")}
        </Txt>
      </Card>
      {status.decision && deciding ? (
        <SyncDecisionSheet
          onClose={() => {
            setDeciding(false);
            onReplaced();
          }}
        />
      ) : null}
      {signingOut ? (
        <Sheet
          title={t("sync.signOut.title")}
          subtitle={t("sync.signOut.body")}
          onClose={() => setSigningOut(false)}
        >
          <Action
            loading={busy}
            onPress={() => {
              setBusy(true);
              void signOut("keep").finally(() => {
                setBusy(false);
                setSigningOut(false);
              });
            }}
          >
            {t("sync.signOut.keep")}
          </Action>
          <Action
            danger
            disabled={busy}
            onPress={() => {
              setBusy(true);
              void signOut("erase").finally(() => {
                setBusy(false);
                setSigningOut(false);
                onReplaced();
              });
            }}
          >
            {t("sync.signOut.erase")}
          </Action>
          <Action secondary disabled={busy} onPress={() => setSigningOut(false)}>
            {t("common.cancel")}
          </Action>
        </Sheet>
      ) : null}
    </>
  );
}

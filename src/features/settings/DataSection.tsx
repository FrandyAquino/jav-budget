import { useState } from "react";
import { router } from "expo-router";
import { useFinance } from "@/features/finance/store";
import { demoState, emptyState } from "@/features/finance/model";
import { parseState } from "@/features/finance/schema";
import { sweepReceipts } from "@/features/transactions/receipts";
import { exportBackup, pickBackup } from "@/features/finance/device";
import {
  Action,
  Card,
  Field,
  FormError,
  Section,
  Sheet,
  useFormAction,
} from "@/shared/ui";
import { SettingsLink } from "./SettingsLink";
import { useT } from "@/shared/i18n/react";
import { autoBackupSupported } from "@/features/backup/files";
import { BackupSettings } from "@/features/backup/BackupSettings";
import { ExportReminder } from "@/features/backup/ExportReminder";
import { serializeBackup } from "@/features/backup/policy";

type Dialog = "reset" | "demo" | "import" | "restore";

// `onReplaced` runs after the whole ledger (including the profile) was replaced.
export function DataSection({ onReplaced }: { onReplaced: () => void }) {
  const { state, update, setNotice } = useFinance();
  const form = useFormAction();
  const modalForm = useFormAction();
  const { t, locale, mediumDate } = useT();
  const confirmWord = t("data.confirmWord");
  const [dialog, setDialog] = useState<Dialog>();
  const [confirmation, setConfirmation] = useState("");
  const [backup, setBackup] = useState("");
  // Date of the automatic backup being restored (dialog "restore").
  const [restoreDate, setRestoreDate] = useState("");
  const open = (next: Dialog) => {
    setConfirmation("");
    setDialog(next);
  };
  const replace = () =>
    modalForm.run(async () => {
      let restored = dialog === "demo" ? demoState() : emptyState();
      if (dialog === "import" || dialog === "restore") {
        if (backup.length > 10_000_000)
          throw new Error(t("data.tooLarge"));
        try {
          restored = parseState(JSON.parse(backup));
        } catch (error) {
          throw new Error(
            error instanceof SyntaxError
              ? t("data.invalidJson")
              : (error as Error).message,
          );
        }
      }
      const replacement = restored;
      await update((s) => ({
        ...replacement,
        settings: {
          ...replacement.settings,
          biometrics: s.settings.biometrics,
          notifications: s.settings.notifications,
          appIcon: s.settings.appIcon,
          // Language is a device preference, like the app lock.
          language: s.settings.language,
          // Backup bookkeeping describes this device, not the restored data.
          autoBackup: s.settings.autoBackup,
          lastExportAt: s.settings.lastExportAt,
        },
      }));
      // Photos of the replaced transactions are no longer referenced.
      sweepReceipts(replacement);
      setDialog(undefined);
      onReplaced();
      setNotice(t("data.replaced"));
    });
  return (
    <>
      <Card style={{ gap: 16 }}>
        <Section
          title={t("data.title")}
          subtitle={t("data.subtitle")}
        />
        {autoBackupSupported ? (
          <BackupSettings
            onRestore={(content, date) => {
              setBackup(content);
              setRestoreDate(date);
              open("restore");
            }}
          />
        ) : (
          <ExportReminder />
        )}
        <Action
          secondary
          loading={form.busy}
          onPress={() =>
            void form.run(async () => {
              await exportBackup(serializeBackup(state));
              const exportedAt = new Date().toISOString();
              await update((s) => ({
                ...s,
                settings: { ...s.settings, lastExportAt: exportedAt },
              }));
              setNotice(t("data.exported"));
            })
          }
        >
          {t("data.export")}
        </Action>
        <Action
          secondary
          onPress={() =>
            void form.run(async () => {
              const content = await pickBackup();
              if (content === undefined) return;
              if (content.length > 10_000_000)
                throw new Error(t("device.backupTooLarge"));
              parseState(JSON.parse(content));
              setBackup(content);
              open("import");
            })
          }
        >
          {t("data.import")}
        </Action>
        <SettingsLink
          icon="file-text"
          label={t("data.csv")}
          detail={t("data.csvDetail")}
          onPress={() => router.push("/import")}
        />
        <Action secondary onPress={() => open("demo")}>
          {t("data.demo")}
        </Action>
        <Action secondary onPress={() => open("reset")}>
          {t("data.erase")}
        </Action>
        <FormError message={form.error} />
      </Card>
      {dialog && (
        <Sheet
          title={
            dialog === "restore"
              ? t("backup.restoreConfirm", { date: mediumDate(restoreDate) })
              : t(`data.dialog.${dialog}`)
          }
          subtitle={t("data.dialogSubtitle")}
          onClose={() => setDialog(undefined)}
        >
          {dialog === "import" && (
            <Field
              label={t("data.paste")}
              accessibilityLabel={t("data.pasteA11y")}
              multiline
              numberOfLines={8}
              value={backup}
              onChangeText={setBackup}
              style={{ minHeight: 180 }}
            />
          )}
          <Field
            label={t("data.confirm", { word: confirmWord })}
            accessibilityLabel={t("data.confirmA11y")}
            value={confirmation}
            onChangeText={setConfirmation}
            autoCapitalize="characters"
          />
          <FormError message={modalForm.error} />
          <Action
            danger
            loading={modalForm.busy}
            disabled={
              confirmation.trim().toLocaleUpperCase(locale) !== confirmWord
            }
            onPress={() => void replace()}
          >
            {t("data.replace")}
          </Action>
          <Action secondary onPress={() => setDialog(undefined)}>
            {t("common.cancel")}
          </Action>
        </Sheet>
      )}
    </>
  );
}

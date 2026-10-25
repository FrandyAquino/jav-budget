import { useEffect, useState, useSyncExternalStore } from "react";
import { Platform, Switch, View } from "react-native";
import { useFinance } from "@/features/finance/store";
import { parseState } from "@/features/finance/schema";
import { SettingsLink } from "@/features/settings/SettingsLink";
import {
  Action,
  FormError,
  Row,
  Sheet,
  Txt,
  useFormAction,
  useTheme,
} from "@/shared/ui";
import { useT } from "@/shared/i18n/react";
import {
  backupNow,
  cachedBackups,
  readBackup,
  shareBackup,
  type BackupEntry,
} from "./files";
import {
  getBackupStatus,
  refreshBackupList,
  subscribeBackupStatus,
} from "./status";

// Native "Automatic backups" controls inside Settings › Data. `onRestore`
// receives validated backup JSON and opens the usual replace confirmation.
export function BackupSettings({
  onRestore,
}: {
  onRestore: (content: string, date: string) => void;
}) {
  const { state, update, setNotice } = useFinance();
  const { colors } = useTheme();
  const { t, mediumDate, number } = useT();
  const form = useFormAction();
  const listForm = useFormAction();
  const [listing, setListing] = useState(false);
  const status = useSyncExternalStore(
    subscribeBackupStatus,
    getBackupStatus,
    getBackupStatus,
  );
  // Files can be removed in the Files app while the app is closed.
  useEffect(() => refreshBackupList(), []);
  const { list: backups, error: listError } = cachedBackups(status.revision);
  const latest = backups[0] as BackupEntry | undefined;
  const enabled = state.settings.autoBackup !== false;
  const size = (bytes: number) =>
    bytes >= 1_000_000
      ? t("backup.sizeMb", { size: number(bytes / 1_000_000, { maximumFractionDigits: 1 }) })
      : t("backup.sizeKb", { size: number(Math.max(1, Math.round(bytes / 1000))) });
  return (
    <View style={{ gap: 14 }}>
      <Row>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt weight="500">{t("backup.auto")}</Txt>
          <Txt size={12} color={colors.muted}>
            {t("backup.autoBody")}
          </Txt>
          {Platform.OS === "ios" ? (
            <Txt size={12} color={colors.muted}>
              {t("backup.autoBodyIos")}
            </Txt>
          ) : null}
        </View>
        <Switch
          accessibilityLabel={t("backup.auto")}
          disabled={form.busy}
          value={enabled}
          onValueChange={(value) =>
            void form.run(() =>
              update((s) => ({
                ...s,
                settings: { ...s.settings, autoBackup: value },
              })),
            )
          }
          trackColor={{ true: colors.accent }}
        />
      </Row>
      <Txt size={13} color={colors.muted}>
        {latest
          ? t("backup.last", {
              date: mediumDate(latest.date),
              count: backups.length,
            })
          : t("backup.none")}
      </Txt>
      {state.demo ? (
        <Txt size={12} color={colors.muted}>
          {t("backup.demoSkipped")}
        </Txt>
      ) : null}
      <FormError message={status.error ? t("backup.lastFailed", { detail: status.error }) : ""} />
      <FormError message={listError ?? ""} />
      <Action
        secondary
        loading={form.busy}
        onPress={() =>
          void form.run(async () => {
            await backupNow(state);
            setNotice(t("backup.done"));
          })
        }
      >
        {t("backup.now")}
      </Action>
      <SettingsLink
        icon="rotate-ccw"
        label={t("backup.restore")}
        detail={t("backup.saved", { count: backups.length })}
        onPress={() => setListing(true)}
      />
      {latest ? (
        <SettingsLink
          icon="share"
          label={t("backup.share")}
          detail={mediumDate(latest.date)}
          onPress={() => void form.run(() => shareBackup(latest))}
        />
      ) : null}
      <FormError message={form.error} />
      {listing && (
        <Sheet
          title={t("backup.restoreTitle")}
          subtitle={t("backup.restoreSubtitle")}
          onClose={() => setListing(false)}
        >
          {backups.length ? (
            backups.map((backup) => (
              <SettingsLink
                key={backup.name}
                icon="archive"
                label={mediumDate(backup.date)}
                detail={size(backup.size)}
                onPress={() =>
                  void listForm.run(async () => {
                    const content = await readBackup(backup);
                    try {
                      parseState(JSON.parse(content));
                    } catch (error) {
                      throw new Error(
                        error instanceof SyntaxError
                          ? t("data.invalidJson")
                          : (error as Error).message,
                      );
                    }
                    setListing(false);
                    onRestore(content, backup.date);
                  })
                }
              />
            ))
          ) : (
            <Txt color={colors.muted}>{t("backup.none")}</Txt>
          )}
          <FormError message={listForm.error} />
          <Action secondary onPress={() => setListing(false)}>
            {t("common.cancel")}
          </Action>
        </Sheet>
      )}
    </View>
  );
}

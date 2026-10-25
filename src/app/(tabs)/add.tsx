import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { TransactionForm } from "@/features/transactions/components";
import type { Kind } from "@/features/finance/model";
import { Empty, Screen } from "@/shared/ui";
import { useT } from "@/shared/i18n/react";

const kinds: Kind[] = ["expense", "income", "transfer"];

export default function AddScreen() {
  const focused = useIsFocused();
  const { t } = useT();
  const { kind } = useLocalSearchParams<{ kind?: Kind }>();
  const initialKind = kind && kinds.includes(kind) ? kind : "expense";
  return (
    <Screen
      title={t("add.title")}
      subtitle={t("add.subtitle")}
    >
      <Empty
        icon="plus"
        title={t("add.emptyTitle")}
        description={t("add.emptyBody")}
      />
      {focused && (
        // Keyed so a quick action for a different kind starts a fresh form.
        <TransactionForm
          key={initialKind}
          initialKind={initialKind}
          onClose={() => router.replace("/")}
        />
      )}
    </Screen>
  );
}

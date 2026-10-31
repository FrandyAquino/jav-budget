import { Pressable, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { useLookups } from "@/features/finance/store";
import type { Transaction } from "@/features/finance/model";
import { useT } from "@/shared/i18n/react";
import { Icon, Row, Txt, useTheme } from "@/shared/ui";

const VISIBLE_TAGS = 3;

export function TransactionRow({
  transaction,
  onPress,
  swipe = false,
}: {
  transaction: Transaction;
  onPress: () => void;
  swipe?: boolean;
}) {
  // Lookups (not the whole ledger): a write elsewhere doesn't re-render rows.
  const { categories, accounts } = useLookups();
  const { colors } = useTheme();
  const { t, money, shortDate } = useT();
  const category = categories.get(transaction.categoryId);
  const account = accounts.get(transaction.accountId);
  const transfer = transaction.kind === "transfer";
  const income = transaction.kind === "income";
  const parts = transaction.splits?.length ?? 0;
  const tags = transaction.tags ?? [];
  const label = transfer
    ? category
      ? `${t("kind.transfer")} · ${category.name}`
      : t("kind.transfer")
    : parts > 1
      ? t("transaction.splitLabel", { count: parts })
      : category?.name;
  const amount = money(transaction.amount, account?.currency ?? "DOP");
  const row = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        t("transaction.editA11y", { title: transaction.title }),
        amount,
        ...(parts > 1 ? [t("transaction.splitA11y")] : []),
        ...(transaction.receipt ? [t("transaction.receiptA11y")] : []),
      ].join(", ")}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 16,
        gap: 13,
        opacity: pressed ? 0.6 : 1,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
      })}
    >
      <View
        style={{
          width: 43,
          height: 43,
          borderRadius: 15,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.input,
        }}
      >
        <Icon
          name={
            transfer
              ? "repeat"
              : parts > 1
                ? "pie-chart"
                : (category?.icon ?? "circle")
          }
          color={colors.text}
          size={19}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt size={14} weight="500" numberOfLines={1}>
          {transaction.title}
        </Txt>
        <Txt size={11} color={colors.muted} numberOfLines={1}>
          {label} · {account?.name}
        </Txt>
        {tags.length > 0 && (
          <Txt size={10} color={colors.muted} numberOfLines={1}>
            {tags
              .slice(0, VISIBLE_TAGS)
              .map((tag) => `#${tag}`)
              .join("  ")}
            {tags.length > VISIBLE_TAGS
              ? `  +${tags.length - VISIBLE_TAGS}`
              : ""}
          </Txt>
        )}
      </View>
      <View style={{ alignItems: "flex-end", gap: 3 }}>
        <Txt
          size={14}
          weight="600"
          color={income ? colors.accent : colors.text}
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {income ? "+" : transfer ? "" : "−"}
          {amount}
        </Txt>
        <Row style={{ gap: 5 }}>
          {transaction.receipt && (
            <Icon name="paperclip" size={10} color={colors.muted} />
          )}
          <Txt size={10} color={colors.muted}>
            {shortDate(transaction.date)}
            {transaction.time ? ` · ${transaction.time}` : ""}
            {transaction.recurringId ? " · ↻" : ""}
          </Txt>
        </Row>
      </View>
    </Pressable>
  );
  return swipe ? (
    <ReanimatedSwipeable
      renderRightActions={() => (
        <Pressable
          accessibilityLabel={t("transaction.editA11y", {
            title: transaction.title,
          })}
          onPress={onPress}
          style={{
            width: 72,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.soft,
          }}
        >
          <Icon name="edit-2" color={colors.accent} />
          <Txt size={11}>{t("common.edit")}</Txt>
        </Pressable>
      )}
    >
      {row}
    </ReanimatedSwipeable>
  ) : (
    row
  );
}

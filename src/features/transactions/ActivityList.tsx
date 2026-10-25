import { FlashList } from "@shopify/flash-list";
import type { ReactElement } from "react";
import { View } from "react-native";
import type { Currency, Transaction } from "@/features/finance/model";
import { useT } from "@/shared/i18n/react";
import { Row, Txt, useTheme } from "@/shared/ui";
import type { ActivityItem, GroupBy } from "./activity-model";
import { TransactionRow } from "./TransactionRow";

const MAX_WIDTH = 1040;

// The list is the screen's only scroll container; header content scrolls with it.
export function ActivityList({
  items,
  groupBy,
  currency,
  header,
  empty,
  onPressRow,
}: {
  items: ActivityItem[];
  groupBy: GroupBy;
  currency: Currency;
  header: ReactElement;
  empty: ReactElement;
  onPressRow: (transaction: Transaction) => void;
}) {
  const { colors } = useTheme();
  const { t, money } = useT();
  const stickyHeaderIndices = items.flatMap((item, index) =>
    item.type === "header" ? [index] : [],
  );
  return (
    <FlashList
      data={items}
      keyExtractor={(item) => item.key}
      getItemType={(item) => item.type}
      stickyHeaderIndices={stickyHeaderIndices}
      extraData={`${groupBy}:${currency}`}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ paddingBottom: 120 }}
      ListHeaderComponent={<Centered>{header}</Centered>}
      ListEmptyComponent={<Centered>{empty}</Centered>}
      renderItem={({ item }) =>
        item.type === "header" ? (
          <Centered background={colors.bg}>
            <View
              style={{
                backgroundColor: colors.bg,
                paddingTop: 18,
                paddingBottom: 10,
              }}
            >
              <Row style={{ justifyContent: "space-between" }}>
                <Txt size={12} weight="600" color={colors.muted}>
                  {item.title}
                </Txt>
                <Txt
                  size={10}
                  color={colors.muted}
                  style={{ fontVariant: ["tabular-nums"] }}
                >
                  {item.total !== undefined
                    ? `${money(item.total, currency)} · `
                    : ""}
                  {t("activity.entries", { count: item.count })}
                </Txt>
              </Row>
            </View>
          </Centered>
        ) : (
          <Centered>
            <View
              style={{ paddingHorizontal: 18, backgroundColor: colors.surface }}
            >
              <TransactionRow
                transaction={item.transaction}
                swipe
                onPress={() => onPressRow(item.transaction)}
              />
            </View>
          </Centered>
        )
      }
    />
  );
}

// FlashList's contentContainerStyle only accepts padding, so width is capped per
// item. Gutters live here too so sticky headers line up with the rows.
function Centered({
  children,
  background,
}: {
  children: ReactElement;
  background?: string;
}) {
  return (
    <View style={{ paddingHorizontal: 22, backgroundColor: background }}>
      <View style={{ width: "100%", maxWidth: MAX_WIDTH, alignSelf: "center" }}>
        {children}
      </View>
    </View>
  );
}

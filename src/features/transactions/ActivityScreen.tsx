import { SelectField } from "@/shared/SelectField";
import { entryViews } from "@/shared/EntryReport";
import { router } from "expo-router";
import { useDeferredValue, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFinanceState } from "@/features/finance/store";
import { useToday } from "@/features/finance/useToday";
import {
  dateString,
  reportEntries,
  type Transaction,
} from "@/features/finance/model";
import {
  Choice,
  Empty,
  Field,
  IconButton,
  Row,
  Txt,
  useTheme,
} from "@/shared/ui";
import {
  activityItems,
  defaultFilters,
  filterTransactions,
  filtersApplied,
  netTotal,
  type Filters,
  type GroupBy,
} from "./activity-model";
import { ActivityList } from "./ActivityList";
import { FiltersSheet } from "./FiltersSheet";
import { TransactionForm } from "./TransactionForm";
import { useT } from "@/shared/i18n/react";

export default function ActivityScreen() {
  const { state } = useFinanceState();
  const { colors } = useTheme();
  const { t, lang, locale, money } = useT();
  const [search, setSearch] = useState("");
  // Typing stays responsive; the list filters at lower priority.
  const query = useDeferredValue(search);
  const [kind, setKind] = useState("all");
  const currency = state.settings.currency;
  const [groupBy, setGroupBy] = useState<GroupBy>("all");
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | "new">();
  // Reactive (not today()): a memoized value would go stale after midnight.
  const now = useToday();
  const forecastEnd = new Date(`${now}T12:00:00`);
  forecastEnd.setDate(forecastEnd.getDate() + 30);
  const source =
    groupBy === "upcoming"
      ? reportEntries(
          state,
          currency,
          { from: now, to: dateString(forecastEnd) },
          "upcoming",
        )
      : state.transactions;
  const rows = filterTransactions(state, source, {
    kind,
    currency,
    groupBy,
    search: query,
    filters,
  });
  const filtered = filtersApplied(filters);
  const items = activityItems(state, rows, groupBy, filters.category, lang);
  const categoryName = filters.category
    ? state.categories.find((c) => c.id === filters.category)?.name
    : undefined;

  const header = (
    <View style={{ gap: 22, paddingTop: 14, marginBottom: 20 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <Txt size={30} weight="600" style={{ letterSpacing: -1 }}>
            {t("activity.title")}
          </Txt>
          <Txt color={colors.muted} size={13} style={{ marginTop: 5 }}>
            {t("activity.subtitle")}
          </Txt>
        </View>
        <IconButton
          icon="plus"
          label={t("activity.add")}
          onPress={() => setEditing("new")}
        />
      </Row>
      <Row>
        <View style={{ flex: 1 }}>
          <Field
            accessibilityLabel={t("activity.searchA11y")}
            placeholder={t("activity.searchPlaceholder")}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <IconButton
          icon="sliders"
          label={t("activity.filters")}
          background={filtered ? colors.hero : colors.surface}
          onPress={() => setFilterOpen(true)}
        />
      </Row>
      <Row style={{ flexWrap: "wrap", justifyContent: "space-between" }}>
        <Choice
          value={kind}
          items={[
            { value: "all", label: t("activity.kindAll") },
            { value: "expense", label: t("kindPlural.expense") },
            { value: "income", label: t("kindPlural.income") },
            { value: "transfer", label: t("kindPlural.transfer") },
          ]}
          onChange={setKind}
        />
      </Row>
      <SelectField
        compact
        label={t("entries.view")}
        value={groupBy}
        onChange={setGroupBy}
        options={[
          ...entryViews(t),
          { value: "account", label: t("activity.byAccount") },
          { value: "type", label: t("activity.byType") },
        ]}
      />
      <View
        style={{
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderColor: colors.line,
          gap: 8,
        }}
      >
        <Txt size={11} color={colors.muted}>
          {t(
            groupBy === "upcoming"
              ? "activity.projectedNet"
              : "activity.netTotal",
          )}{" "}
          · {currency}
          {categoryName
            ? ` · ${t("activity.categoryShare", {
                name: categoryName.toLocaleUpperCase(locale),
              })}`
            : ""}
        </Txt>
        <Txt size={30} weight="600" style={{ fontVariant: ["tabular-nums"] }}>
          {money(netTotal(rows, filters.category), currency)}
        </Txt>
        {groupBy === "upcoming" && (
          <Txt size={11} color={colors.muted}>
            {t("activity.forecastOnly")}
          </Txt>
        )}
        {categoryName && (
          <Txt size={11} color={colors.muted}>
            {t("activity.splitShare", { name: categoryName })}
          </Txt>
        )}
      </View>
      <Row style={{ justifyContent: "space-between" }}>
        <Txt size={12} color={colors.muted}>
          {t("activity.count", { count: rows.length })}
          {filtered ? ` · ${t("activity.filtersApplied")}` : ""}
        </Txt>
        <Txt size={11} color={colors.muted}>
          {t("activity.tapToEdit")}
        </Txt>
      </Row>
    </View>
  );

  const empty = (
    <Empty
      title={t("activity.emptyTitle")}
      description={t(
        state.transactions.length
          ? "activity.emptyFiltered"
          : "activity.emptyFirst",
      )}
      action={t(
        state.transactions.length ? "activity.clearFilters" : "activity.add",
      )}
      onPress={() => {
        if (state.transactions.length) {
          setSearch("");
          setKind("all");
          setGroupBy("all");
          setFilters(defaultFilters);
        } else setEditing("new");
      }}
    />
  );

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <ActivityList
        items={items}
        groupBy={groupBy}
        currency={currency}
        header={header}
        empty={empty}
        onPressRow={(item) =>
          groupBy === "upcoming" ? router.push("/recurring") : setEditing(item)
        }
      />
      {editing && (
        <TransactionForm
          transaction={editing === "new" ? undefined : editing}
          onClose={() => setEditing(undefined)}
        />
      )}
      {filterOpen && (
        <FiltersSheet
          initial={filters}
          onClose={() => setFilterOpen(false)}
          onApply={(value) => {
            setFilters(value);
            setFilterOpen(false);
          }}
        />
      )}
    </SafeAreaView>
  );
}

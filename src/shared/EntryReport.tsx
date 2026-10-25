import { useState } from "react";
import { View } from "react-native";
import { useFinance } from "@/features/finance/store";
import {
  allocations,
  categoryAmount,
  dateString,
  reportEntries,
  today,
  weekStart,
  type DateRange,
  type EntryView,
} from "@/features/finance/model";
import { SelectField } from "./SelectField";
import { Row, Txt, useTheme } from "./ui";
import { useT } from "./i18n/react";
import type { Translate } from "./i18n/core";
export const entryViews = (t: Translate) =>
  [
    { value: "all", label: t("entries.all") },
    { value: "category", label: t("entries.byCategory") },
    { value: "day", label: t("entries.byDay") },
    { value: "week", label: t("entries.byWeek") },
    { value: "month", label: t("entries.byMonth") },
    { value: "recurring", label: t("entries.recurring") },
    { value: "upcoming", label: t("entries.upcoming") },
  ] satisfies { value: EntryView; label: string }[];
export function useEntryReport(range: DateRange) {
  const { state } = useFinance();
  const [mode, setMode] = useState<EntryView>("all");
  const [category, setCategory] = useState("");
  const end = new Date(`${today()}T12:00:00`);
  end.setDate(end.getDate() + 30);
  const scope =
    mode === "upcoming" ? { from: today(), to: dateString(end) } : range;
  const rows = reportEntries(
    state,
    state.settings.currency,
    scope,
    mode,
    category,
  );
  // A category filter counts only that category's share of split entries.
  const share = (t: (typeof rows)[number]) =>
    category ? categoryAmount(t, category) : t.amount;
  const income = rows
    .filter((t) => t.kind === "income")
    .reduce((s, t) => s + share(t), 0);
  const expense = rows
    .filter((t) => t.kind === "expense")
    .reduce((s, t) => s + share(t), 0);
  return { mode, setMode, category, setCategory, rows, income, expense, scope };
}
export function EntryReportControls({
  report,
}: {
  report: ReturnType<typeof useEntryReport>;
}) {
  const { state } = useFinance();
  const { colors } = useTheme();
  const { t } = useT();
  return (
    <View style={{ gap: 10 }}>
      <SelectField
        compact
        label={t("entries.view")}
        value={report.mode}
        options={entryViews(t)}
        onChange={(mode) => {
          report.setMode(mode);
          report.setCategory("");
        }}
      />
      {report.mode === "category" && (
        <SelectField
          compact
          label={t("entries.filterCategory")}
          value={report.category}
          options={[
            { value: "", label: t("entries.allCategories") },
            ...state.categories.map((c) => ({
              value: c.id,
              label: c.name,
              icon: c.icon,
            })),
          ]}
          onChange={report.setCategory}
        />
      )}
      {report.mode === "upcoming" && (
        <Txt size={12} color={colors.muted}>
          {t("entries.forecastHint")}
        </Txt>
      )}
    </View>
  );
}
export function EntryBreakdown({
  report,
}: {
  report: ReturnType<typeof useEntryReport>;
}) {
  const { state } = useFinance();
  const { colors } = useTheme();
  const { t, money, monthLabel, shortDate, mediumDate } = useT();
  if (report.mode === "all" || report.mode === "recurring") return null;
  // Keys sort chronologically (ISO dates) or by name; labels are localized.
  const label = (key: string) =>
    report.mode === "month"
      ? monthLabel(key)
      : report.mode === "week"
        ? t("dates.weekOf", { date: shortDate(key) })
        : report.mode === "day" || report.mode === "upcoming"
          ? mediumDate(key)
          : key;
  const groups = new Map<string, { income: number; expense: number }>();
  for (const tx of report.rows) {
    if (tx.kind === "transfer") continue;
    const kind = tx.kind;
    const add = (key: string, amount: number) => {
      const group = groups.get(key) ?? { income: 0, expense: 0 };
      group[kind] += amount;
      groups.set(key, group);
    };
    if (report.mode === "category") {
      for (const part of allocations(tx))
        if (!report.category || part.categoryId === report.category)
          add(
            state.categories.find((c) => c.id === part.categoryId)?.name ??
              t("common.uncategorized"),
            part.amount,
          );
      continue;
    }
    add(
      report.mode === "month"
        ? tx.date.slice(0, 7)
        : report.mode === "week"
          ? weekStart(tx.date)
          : tx.date,
      tx.amount,
    );
  }
  return (
    <View style={{ gap: 12 }}>
      <Row>
        <Txt weight="600" style={{ flex: 1 }}>
          {t("entries.breakdown")}
        </Txt>
        <Txt size={11} color={colors.muted}>
          {t("entries.breakdownColumns")}
        </Txt>
      </Row>
      {!groups.size && (
        <Txt color={colors.muted}>{t("entries.emptyView")}</Txt>
      )}
      {[...groups]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, g]) => (
          <View
            key={key}
            style={{
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderColor: colors.line,
              gap: 5,
            }}
          >
            <Txt weight="500">{label(key)}</Txt>
            <Txt size={12} color={colors.muted}>
              {money(g.income, state.settings.currency)} /{" "}
              {money(g.expense, state.settings.currency)} /{" "}
              {money(g.income - g.expense, state.settings.currency)}
            </Txt>
          </View>
        ))}
    </View>
  );
}

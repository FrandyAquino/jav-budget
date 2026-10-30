import {
  EntryReportControls,
  EntryBreakdown,
  useEntryReport,
} from "@/shared/EntryReport";
import { useState } from "react";
import { View } from "react-native";
import { useFinance } from "@/features/finance/store";
import {
  availableState,
  netWorth,
  type Kind,
  type Transaction,
} from "@/features/finance/model";
import {
  CurrencySwitch,
  Grid,
  Icon,
  Row,
  Screen,
  Txt,
  useTheme,
} from "@/shared/ui";
import { PeriodSelector, usePeriod } from "@/shared/PeriodSelector";
import { TransactionForm } from "@/features/transactions/components";
import { NetWorthHero } from "./NetWorthHero";
import { HomeHeaderActions } from "./HomeHeader";
import { QuickActions } from "./QuickActions";
import {
  CashFlowCard,
  RecentActivityCard,
  SpendingCard,
} from "./ActivityCards";
import { AccountsCard } from "./AccountsCard";
import { BudgetCard } from "./BudgetCard";
import { UpcomingCard } from "./UpcomingCard";
import { WorkspaceSheet } from "./HomeSheets";
import { useT } from "@/shared/i18n/react";
import { ExportReminder } from "@/features/backup/ExportReminder";

export default function HomeScreen() {
  const { state } = useFinance();
  const { colors } = useTheme();
  const { t, monthLabel } = useT();
  const period = usePeriod();
  const report = useEntryReport(period.range);
  const [quickAdd, setQuickAdd] = useState<Kind>();
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState<Transaction>();
  const currency = state.settings.currency;
  // Savings accounts can be left out of the hero; "all" shows every account.
  const [scope, setScope] = useState<"available" | "all">("available");
  const hasSavings = state.accounts.some((a) => a.excludeFromTotal);
  const heroState =
    hasSavings && scope === "available" ? availableState(state) : state;
  const worth = netWorth(heroState, currency);
  return (
    <Screen
      title={
        state.settings.name
          ? t("home.greeting", { name: state.settings.name.split(" ")[0] })
          : t("home.overview")
      }
      subtitle={t("home.subtitle")}
      right={<HomeHeaderActions onOpenMenu={() => setMenu(true)} />}
    >
      <Row style={{ justifyContent: "space-between", marginTop: -8 }}>
        <Row style={{ gap: 7 }}>
          <Icon name="calendar" size={14} color={colors.muted} />
          <Txt size={12} color={colors.muted}>
            {monthLabel(new Date())}
          </Txt>
        </Row>
        <CurrencySwitch />
      </Row>
      <PeriodSelector period={period} />
      <EntryReportControls report={report} />
      <ExportReminder />
      <Grid>
        {[
          <View key="main" style={{ gap: 24 }}>
            <NetWorthHero
              state={heroState}
              scope={hasSavings ? scope : undefined}
              onScopeChange={setScope}
              worth={worth}
              range={period.range}
              income={report.income}
              expense={report.expense}
              upcoming={report.mode === "upcoming"}
            />
            <QuickActions onAdd={setQuickAdd} />
            <EntryBreakdown report={report} />
            <CashFlowCard
              state={state}
              currency={currency}
              report={report}
              month={period.range.to.slice(0, 7)}
            />
            <RecentActivityCard report={report} onEdit={setEditing} />
          </View>,
          <View key="side" style={{ gap: 24 }}>
            <AccountsCard state={state} currency={currency} />
            <BudgetCard state={state} currency={currency} />
            <SpendingCard state={state} currency={currency} report={report} />
            <UpcomingCard state={state} currency={currency} />
          </View>,
        ]}
      </Grid>
      <Row style={{ justifyContent: "center", gap: 6 }}>
        <Icon name="shield" size={12} color={colors.muted} />
        <Txt size={10} color={colors.muted}>
          {t("home.footer")}
        </Txt>
      </Row>
      {editing && (
        <TransactionForm
          transaction={editing}
          onClose={() => setEditing(undefined)}
        />
      )}
      {quickAdd && (
        <TransactionForm
          initialKind={quickAdd}
          onClose={() => setQuickAdd(undefined)}
        />
      )}
      {menu && <WorkspaceSheet onClose={() => setMenu(false)} />}
    </Screen>
  );
}

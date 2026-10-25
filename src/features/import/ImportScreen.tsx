import { memo, useMemo, useState, type ReactNode } from "react";
import {
  FlatList,
  Switch,
  View,
  useWindowDimensions,
  type ListRenderItem,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useFinance } from "@/features/finance/store";
import type { Category, Currency } from "@/features/finance/model";
import { useT } from "@/shared/i18n/react";
import {
  applyImport,
  buildImport,
  type ImportCandidate,
  type ImportTarget,
} from "@/features/finance/csv";
import { SelectField } from "@/shared/SelectField";
import {
  Action,
  Card,
  Choice,
  Empty,
  FormError,
  IconButton,
  Row,
  Section,
  Txt,
  useFormAction,
  useTheme,
} from "@/shared/ui";
import { pickCsv } from "./pick-csv";
import {
  columnOptions,
  guessFormatFor,
  initialDraft,
  readRows,
  sniffDelimiter,
  toMapping,
  type Delimiter,
  type MappingDraft,
} from "./mapping";

type Step = "pick" | "map" | "review";
type Filter = "all" | "new" | "duplicate" | "invalid";
const PREVIEW_ROWS = 50;

function defaultCategory(categories: Category[], kind: Category["kind"]) {
  const own = categories.filter((c) => c.kind === kind);
  return (
    own.find((c) => /\b(other|others|otro|otros|misc|general)\b/i.test(c.name))
      ?.id ??
    own[0]?.id ??
    ""
  );
}
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace("/settings");
}

const CandidateRow = memo(function CandidateRow({
  candidate,
  line,
  currency,
}: {
  candidate: ImportCandidate;
  line: number;
  currency: Currency;
}) {
  const { colors } = useTheme();
  const { t, money, mediumDate } = useT();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.line,
        borderWidth: 1,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginBottom: 8,
      }}
    >
      {candidate.ok ? (
        <Row>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt weight="500" numberOfLines={1}>
              {candidate.transaction.title}
            </Txt>
            <Txt size={12} color={colors.muted}>
              {mediumDate(candidate.transaction.date)} ·{" "}
              {t("import.row", { line })}
              {candidate.duplicate ? " · " : ""}
              {candidate.duplicate ? (
                <Txt size={12} color={colors.orange}>
                  {t("import.possibleDuplicate")}
                </Txt>
              ) : null}
            </Txt>
          </View>
          <Txt weight="600" style={{ fontVariant: ["tabular-nums"] }}>
            {candidate.transaction.kind === "income" ? "+" : "−"}
            {money(candidate.transaction.amount, currency)}
          </Txt>
        </Row>
      ) : (
        <View style={{ gap: 2 }}>
          <Txt weight="500">{t("import.skipped", { line })}</Txt>
          <Txt size={12} color={colors.danger}>
            {candidate.reason}
          </Txt>
        </View>
      )}
    </View>
  );
});

function Stat({ label, value }: { label: string; value: number }) {
  const { colors } = useTheme();
  const { number } = useT();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Txt size={22} weight="600" style={{ fontVariant: ["tabular-nums"] }}>
        {number(value)}
      </Txt>
      <Txt size={12} color={colors.muted}>
        {label}
      </Txt>
    </View>
  );
}

export default function ImportScreen() {
  const { state, update, setNotice } = useFinance();
  const { colors } = useTheme();
  const { t, lang } = useT();
  const { width } = useWindowDimensions();
  const form = useFormAction();
  const NONE = { value: "", label: t("import.notUsed"), icon: "slash" };
  const [step, setStep] = useState<Step>("pick");
  const [file, setFile] = useState<{ name: string; text: string }>();
  const [rows, setRows] = useState<string[][]>([]);
  const [draft, setDraft] = useState<MappingDraft>();
  const [accountId, setAccountId] = useState(state.accounts[0]?.id ?? "");
  const [expenseCategoryId, setExpenseCategoryId] = useState(() =>
    defaultCategory(state.categories, "expense"),
  );
  const [incomeCategoryId, setIncomeCategoryId] = useState(() =>
    defaultCategory(state.categories, "income"),
  );
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const account = state.accounts.find((a) => a.id === accountId);
  const dataRows = useMemo(
    () => (draft?.hasHeader ? rows.slice(1) : rows),
    [rows, draft?.hasHeader],
  );
  const mapped = useMemo(
    () => (draft ? toMapping(draft, lang) : undefined),
    [draft, lang],
  );
  const mapping = mapped && "mapping" in mapped ? mapped.mapping : undefined;
  const target: ImportTarget = {
    accountId,
    expenseCategoryId,
    incomeCategoryId,
  };
  const targetError = !account
    ? t("errors.chooseAccount")
    : !expenseCategoryId || !incomeCategoryId
      ? t("import.needCategories")
      : "";
  const mappingError =
    (mapped && "error" in mapped ? mapped.error : "") || targetError;

  const candidates = useMemo(() => {
    if (!mapping || targetError || step === "pick") return [];
    const source = step === "map" ? dataRows.slice(0, PREVIEW_ROWS) : dataRows;
    try {
      return buildImport(
        source,
        mapping,
        { accountId, expenseCategoryId, incomeCategoryId },
        state,
        lang,
      );
    } catch {
      return [];
    }
  }, [
    mapping,
    dataRows,
    step,
    accountId,
    expenseCategoryId,
    incomeCategoryId,
    state,
    targetError,
    lang,
  ]);

  const counts = useMemo(() => {
    let fresh = 0;
    let duplicates = 0;
    let invalid = 0;
    for (const c of candidates)
      if (!c.ok) invalid++;
      else if (c.duplicate) duplicates++;
      else fresh++;
    return { fresh, duplicates, invalid };
  }, [candidates]);
  const visible = useMemo(
    () =>
      filter === "all"
        ? candidates
        : candidates.filter((c) =>
            filter === "invalid"
              ? !c.ok
              : c.ok && (filter === "duplicate") === c.duplicate,
          ),
    [candidates, filter],
  );
  const importCount =
    counts.fresh + (includeDuplicates ? counts.duplicates : 0);
  const lineOffset = draft?.hasHeader ? 2 : 1;
  const currency = account?.currency ?? state.settings.currency;

  const load = (text: string, delimiter: Delimiter) => {
    const parsed = readRows(text, delimiter);
    if (!parsed.length) throw new Error(t("import.empty"));
    const next = initialDraft(parsed, delimiter);
    if ((next.hasHeader ? parsed.length - 1 : parsed.length) < 1)
      throw new Error(t("import.headerOnly"));
    if (parsed.slice(0, 50).every((r) => r.length < 2))
      throw new Error(t("import.noColumns"));
    setRows(parsed);
    setDraft(next);
  };
  const choose = () =>
    void form.run(async () => {
      const picked = await pickCsv();
      if (!picked) return;
      if (!picked.text.trim()) throw new Error(t("import.empty"));
      if (picked.text.includes("\u0000"))
        throw new Error(t("import.notText"));
      load(picked.text, sniffDelimiter(picked.text));
      setFile(picked);
      setFilter("all");
      setIncludeDuplicates(false);
      setStep("map");
    });
  const set = (patch: Partial<MappingDraft>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));
  const runImport = () =>
    void form.run(async () => {
      if (!mapping) throw new Error(mappingError || t("import.finishMapping"));
      let added = 0;
      await update((s) => {
        const result = applyImport(
          s,
          buildImport(dataRows, mapping, target, s),
          includeDuplicates,
        );
        added = result.added;
        return result.state;
      });
      if (!added)
        throw new Error(t("import.nothingToImport"));
      setNotice(t("import.imported", { count: added }));
      leave();
    });

  const columns = useMemo(
    () => columnOptions(rows, draft?.hasHeader ?? true, lang),
    [rows, draft?.hasHeader, lang],
  );
  const accountOptions = state.accounts.map((a) => ({
    value: a.id,
    label: a.name,
    detail: a.currency,
    icon: a.type === "cash" ? "dollar-sign" : "credit-card",
  }));
  const categoryOptions = (kind: Category["kind"]) =>
    state.categories
      .filter((c) => c.kind === kind)
      .map((c) => ({ value: c.id, label: c.name, icon: c.icon }));

  const subtitle =
    step === "pick"
      ? t("import.subtitlePick")
      : step === "map"
        ? t("import.subtitleMap", { name: file?.name ?? t("import.yourFile") })
        : t("import.subtitleReview");

  let body: ReactNode = null;
  let listTitle: ReactNode = null;
  let footer: ReactNode = null;
  if (!state.accounts.length) {
    body = (
      <Card>
        <Empty
          icon="credit-card"
          title={t("import.noAccountTitle")}
          description={t("import.noAccountBody")}
          action={t("preferences.manageAccounts")}
          onPress={() => router.push("/accounts")}
        />
      </Card>
    );
  } else if (step === "pick" || !draft) {
    body = (
      <Card style={{ gap: 16 }}>
        <Section
          title={t("import.pickTitle")}
          subtitle={t("import.pickSubtitle")}
        />
        <Txt size={12} color={colors.muted}>
          {t("import.pickHint")}
        </Txt>
        <FormError message={form.error} />
        <Action loading={form.busy} onPress={choose}>
          {t("import.pickAction")}
        </Action>
      </Card>
    );
  } else if (step === "map") {
    body = (
      <Card style={{ gap: 16 }}>
        <Section title={t("import.columns")} />
        <Txt size={12} color={colors.muted}>
          {t("import.separator")}
        </Txt>
        <Choice
          value={draft.delimiter}
          items={[
            { value: ",", label: t("import.comma") },
            { value: ";", label: t("import.semicolon") },
            { value: "\t", label: t("import.tab") },
          ]}
          onChange={(delimiter) =>
            void form.run(async () => {
              if (file) load(file.text, delimiter);
            })
          }
        />
        <Row>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt weight="500">{t("import.header")}</Txt>
            <Txt size={12} color={colors.muted}>
              {t("import.headerHint")}
            </Txt>
          </View>
          <Switch
            accessibilityLabel={t("import.header")}
            value={draft.hasHeader}
            onValueChange={(hasHeader) => set({ hasHeader })}
            trackColor={{ true: colors.accent }}
          />
        </Row>
        <SelectField
          label={t("dateTime.date")}
          value={draft.date}
          options={columns}
          placeholder={t("import.chooseColumn")}
          onChange={(date) =>
            set({
              date,
              dateFormat: guessFormatFor(dataRows, date, draft.dateFormat),
            })
          }
        />
        <SelectField
          label={t("import.dateFormat")}
          value={draft.dateFormat}
          options={[
            {
              value: "DD/MM/YYYY",
              label: t("import.format.dmy"),
              detail: "25/10/2026",
            },
            {
              value: "MM/DD/YYYY",
              label: t("import.format.mdy"),
              detail: "10/25/2026",
            },
            {
              value: "YYYY-MM-DD",
              label: t("import.format.ymd"),
              detail: "2026-10-25",
            },
          ]}
          onChange={(dateFormat) => set({ dateFormat })}
        />
        <SelectField
          label={t("txForm.description")}
          value={draft.description}
          options={columns}
          placeholder={t("import.chooseColumn")}
          onChange={(description) => set({ description })}
        />
        <Txt size={12} color={colors.muted}>
          {t("import.amounts")}
        </Txt>
        <Choice
          value={draft.mode}
          items={[
            { value: "amount", label: t("import.signed") },
            { value: "split", label: t("import.debitCredit") },
          ]}
          onChange={(mode) => set({ mode })}
        />
        {draft.mode === "amount" ? (
          <SelectField
            label={t("import.amountColumn")}
            value={draft.amount}
            options={columns}
            placeholder={t("import.chooseColumn")}
            onChange={(amount) => set({ amount })}
          />
        ) : (
          <>
            <SelectField
              label={t("import.debit")}
              value={draft.debit}
              options={[NONE, ...columns]}
              onChange={(debit) => set({ debit })}
            />
            <SelectField
              label={t("import.credit")}
              value={draft.credit}
              options={[NONE, ...columns]}
              onChange={(credit) => set({ credit })}
            />
          </>
        )}
        <Section title={t("import.destination")} />
        <SelectField
          label={t("txForm.account")}
          value={accountId}
          options={accountOptions}
          onChange={setAccountId}
        />
        <SelectField
          label={t("import.expenseCategory")}
          value={expenseCategoryId}
          options={categoryOptions("expense")}
          onChange={setExpenseCategoryId}
        />
        <SelectField
          label={t("import.incomeCategory")}
          value={incomeCategoryId}
          options={categoryOptions("income")}
          onChange={setIncomeCategoryId}
        />
        <Txt size={11} color={colors.muted}>
          {t("import.currencyHint", { currency })}
        </Txt>
      </Card>
    );
    listTitle = (
      <Section
        title={t("import.preview")}
        subtitle={
          mappingError ||
          t("import.previewCount", {
            shown: Math.min(PREVIEW_ROWS, dataRows.length),
            count: dataRows.length,
          })
        }
      />
    );
    footer = (
      <View style={{ gap: 12, marginTop: 12 }}>
        <FormError message={form.error} />
        <Action
          disabled={!!mappingError}
          onPress={() => {
            setFilter("all");
            setStep("review");
          }}
        >
          {t("import.reviewAll")}
        </Action>
        <Action secondary onPress={() => setStep("pick")}>
          {t("import.another")}
        </Action>
      </View>
    );
  } else {
    body = (
      <Card style={{ gap: 18 }}>
        <Row style={{ alignItems: "flex-start" }}>
          <Stat label={t("import.new")} value={counts.fresh} />
          <Stat label={t("import.duplicates")} value={counts.duplicates} />
          <Stat label={t("import.invalid")} value={counts.invalid} />
        </Row>
        <Row>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt weight="500">{t("import.includeDuplicates")}</Txt>
            <Txt size={12} color={colors.muted}>
              {t("import.includeDuplicatesHint")}
            </Txt>
          </View>
          <Switch
            accessibilityLabel={t("import.includeDuplicates")}
            disabled={!counts.duplicates}
            value={includeDuplicates}
            onValueChange={setIncludeDuplicates}
            trackColor={{ true: colors.accent }}
          />
        </Row>
        <Choice
          value={filter}
          items={[
            {
              value: "all",
              label: t("import.filterAll", { count: candidates.length }),
            },
            { value: "new", label: t("import.filterNew", { count: counts.fresh }) },
            {
              value: "duplicate",
              label: t("import.filterDuplicates", { count: counts.duplicates }),
            },
            {
              value: "invalid",
              label: t("import.filterInvalid", { count: counts.invalid }),
            },
          ]}
          onChange={setFilter}
        />
      </Card>
    );
    footer = (
      <View style={{ gap: 12, marginTop: 12 }}>
        <FormError message={form.error} />
        <Action loading={form.busy} disabled={!importCount} onPress={runImport}>
          {importCount
            ? t("import.importCount", { count: importCount })
            : t("import.nothing")}
        </Action>
        <Action secondary onPress={() => setStep("map")}>
          {t("import.backToColumns")}
        </Action>
      </View>
    );
  }

  const renderItem: ListRenderItem<ImportCandidate> = ({ item }) => (
    <CandidateRow
      candidate={item}
      line={item.index + lineOffset}
      currency={currency}
    />
  );
  const padding = width > 700 ? 36 : 22;
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <FlatList
        data={step === "pick" ? [] : visible}
        keyExtractor={(item) => String(item.index)}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={15}
        windowSize={7}
        contentContainerStyle={{
          padding,
          paddingBottom: 115,
          width: "100%",
          maxWidth: 760,
          alignSelf: "center",
        }}
        ListHeaderComponent={
          <View style={{ gap: 26, marginBottom: listTitle ? 0 : 16 }}>
            <Row style={{ justifyContent: "space-between", gap: 16 }}>
              <View style={{ flex: 1 }}>
                <Txt
                  size={width > 700 ? 32 : 28}
                  weight="600"
                  style={{ letterSpacing: -1.1 }}
                >
                  {t("data.csv")}
                </Txt>
                <Txt size={13} color={colors.muted} style={{ marginTop: 5 }}>
                  {subtitle}
                </Txt>
              </View>
              <IconButton
                icon="x"
                label={t("import.close")}
                onPress={leave}
              />
            </Row>
            {body}
            {listTitle}
          </View>
        }
        ListEmptyComponent={
          step === "review" ? (
            <Txt
              color={colors.muted}
              style={{ textAlign: "center", padding: 20 }}
            >
              {t("import.noRows")}
            </Txt>
          ) : undefined
        }
        ListFooterComponent={footer ? <>{footer}</> : undefined}
      />
    </SafeAreaView>
  );
}

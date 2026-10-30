import { SelectField } from "@/shared/SelectField";
import { RecurrenceField } from "@/shared/RecurrenceField";
import { useState } from "react";
import { Pressable, Switch, View } from "react-native";
import { router } from "expo-router";
import { useFinance } from "@/features/finance/store";
import {
  entryAmount,
  id,
  normalizeTags,
  processRecurring,
  today,
  validDate,
  type Recurring,
} from "@/features/finance/model";
import {
  Action,
  Card,
  Choice,
  Empty,
  AmountField,
  Field,
  DateField,
  FormError,
  Icon,
  IconButton,
  Row,
  Screen,
  Sheet,
  Txt,
  useFormAction,
  useTheme,
} from "@/shared/ui";
import {
  SplitEditor,
  amountText,
  buildSplits,
  draftParts,
  newPart,
  type SplitDraft,
} from "@/features/transactions/SplitEditor";
import { TagsField } from "@/features/transactions/TagsField";
import { useT } from "@/shared/i18n/react";
import { frequencyLabel } from "@/shared/i18n/labels";

export default function RecurringScreen() {
  const { state } = useFinance();
  const { colors } = useTheme();
  const { t, money, shortDate } = useT();
  const [editing, setEditing] = useState<Recurring | "new">();
  const [filter, setFilter] = useState("all");
  const rules = state.recurring
    .filter(
      (r) =>
        filter === "all" ||
        (filter === "subscriptions" ? r.subscription : r.active),
    )
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  return (
    <Screen
      title={t("recurring.title")}
      subtitle={t("recurring.subtitle")}
      right={
        <IconButton
          icon="x"
          label={t("recurring.close")}
          onPress={() => router.back()}
        />
      }
    >
      <Action onPress={() => setEditing("new")}>{t("recurring.add")}</Action>
      <Choice
        value={filter}
        items={[
          { value: "all", label: t("entries.all") },
          { value: "active", label: t("recurring.active") },
          { value: "subscriptions", label: t("recurring.subscriptions") },
        ]}
        onChange={setFilter}
      />
      <Card>
        {rules.length ? (
          rules.map((r) => {
            const account = state.accounts.find((a) => a.id === r.accountId);
            return (
              <Pressable
                key={r.id}
                accessibilityRole="button"
                onPress={() => setEditing(r)}
                style={{
                  paddingVertical: 17,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.line,
                }}
              >
                <Row>
                  <View
                    style={{
                      backgroundColor: colors.soft,
                      padding: 13,
                      borderRadius: 15,
                    }}
                  >
                    <Icon
                      name={r.subscription ? "play-circle" : "repeat"}
                      color={colors.accent}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt weight="500">{r.title}</Txt>
                    <Txt size={11} color={colors.muted}>
                      {r.active
                        ? t("recurring.next", { date: shortDate(r.nextDate) })
                        : t("recurring.paused")}{" "}
                      · {frequencyLabel(t, r)}
                    </Txt>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Txt weight="600">
                      {money(r.amount, account?.currency ?? "DOP")}
                    </Txt>
                    <Txt size={10} color={colors.muted}>
                      {r.subscription
                        ? t("recurring.subscription")
                        : t(`kind.${r.kind}`)}
                    </Txt>
                  </View>
                </Row>
              </Pressable>
            );
          })
        ) : (
          <Empty
            icon="repeat"
            title={t("recurring.emptyTitle")}
            description={t("recurring.emptyBody")}
          />
        )}
      </Card>
      <Txt size={12} color={colors.muted}>
        {t("recurring.footnote")}
      </Txt>
      {editing && (
        <RecurringForm
          rule={editing === "new" ? undefined : editing}
          onClose={() => setEditing(undefined)}
        />
      )}
    </Screen>
  );
}
function RecurringForm({
  rule,
  onClose,
}: {
  rule?: Recurring;
  onClose: () => void;
}) {
  const { state, update, setNotice } = useFinance();
  const { colors } = useTheme();
  const { t } = useT();
  const form = useFormAction();
  const [title, setTitle] = useState(rule?.title ?? "");
  const mode = state.settings.numberEntry;
  const [amount, setAmount] = useState(
    rule ? amountText(rule.amount, mode) : "",
  );
  const [accountId, setAccount] = useState(
    rule?.accountId ??
      state.accounts.find((a) => a.currency === state.settings.currency)?.id ??
      state.accounts[0]?.id ??
      "",
  );
  const [kind, setKind] = useState<"expense" | "income">(
    rule?.kind === "income" ? "income" : "expense",
  );
  const [categoryId, setCategory] = useState(
    rule?.categoryId ?? state.categories.find((c) => c.kind === kind)?.id ?? "",
  );
  const [splitting, setSplitting] = useState(!!rule?.splits?.length);
  const [parts, setParts] = useState<SplitDraft[]>(() =>
    draftParts(rule?.splits, mode),
  );
  const [tags, setTags] = useState<string[]>(rule?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const kindCategories = (value: "expense" | "income") =>
    state.categories.filter((c) => c.kind === value);
  const defaultParts = (value: "expense" | "income", first = "") => {
    const options = kindCategories(value);
    const primary = first || options[0]?.id || "";
    return [
      newPart(primary),
      newPart(options.find((c) => c.id !== primary)?.id ?? ""),
    ];
  };
  const [date, setDate] = useState(rule?.nextDate ?? today());
  const [frequency, setFrequency] = useState<Recurring["frequency"]>(
    rule?.frequency ?? "monthly",
  );
  const [interval, setInterval] = useState(String(rule?.intervalDays ?? 3));
  const [subscription, setSubscription] = useState(rule?.subscription ?? false);
  const [active, setActive] = useState(rule?.active ?? true);
  const [deleting, setDeleting] = useState(false);
  return (
    <Sheet
      title={t(
        deleting
          ? "recurringForm.stopTitle"
          : rule
            ? "recurringForm.editTitle"
            : "recurringForm.newTitle",
      )}
      onClose={onClose}
    >
      {!state.accounts.length ? (
        <Empty
          title={t("recurringForm.noAccountTitle")}
          description={t("recurringForm.noAccountBody")}
          action={t("recurringForm.goToAccounts")}
          onPress={() => {
            onClose();
            router.push("/accounts");
          }}
        />
      ) : deleting ? (
        <>
          <Txt>
            {t("recurringForm.stopBody")}
          </Txt>
          <Action
            danger
            loading={form.busy}
            onPress={() =>
              void form.run(async () => {
                await update((s) => ({
                  ...s,
                  recurring: s.recurring.filter((r) => r.id !== rule?.id),
                }));
                onClose();
              })
            }
          >
            {t("recurringForm.stopConfirm")}
          </Action>
          <Action secondary onPress={() => setDeleting(false)}>
            {t("recurringForm.keep")}
          </Action>
        </>
      ) : rule?.kind === "transfer" ? (
        <>
          <Txt>{t("recurringForm.transferTitle", { title: rule.title })}</Txt>
          <Txt>{t("recurringForm.transferBody")}</Txt>
          <Action
            onPress={() =>
              void form.run(async () => {
                await update((s) => ({
                  ...s,
                  recurring: s.recurring.map((r) =>
                    r.id === rule.id
                      ? {
                          ...r,
                          active: !r.active,
                          nextDate:
                            !r.active && r.nextDate < today()
                              ? today()
                              : r.nextDate,
                        }
                      : r,
                  ),
                }));
                onClose();
              })
            }
          >
            {t(rule.active ? "recurringForm.pause" : "recurringForm.resume")}
          </Action>
          <Action secondary onPress={() => setDeleting(true)}>
            {t("recurringForm.stop")}
          </Action>
        </>
      ) : (
        <>
          <Field
            label={t("recurringForm.name")}
            accessibilityLabel={t("recurringForm.nameA11y")}
            placeholder={t("recurringForm.namePlaceholder")}
            value={title}
            onChangeText={setTitle}
            maxLength={120}
          />
          <Choice
            value={kind}
            items={[
              { value: "expense", label: t("kind.expense") },
              { value: "income", label: t("kind.income") },
            ]}
            onChange={(v) => {
              setKind(v);
              const first = kindCategories(v)[0]?.id ?? "";
              setCategory(first);
              if (splitting) setParts(defaultParts(v, first));
            }}
          />
          <AmountField
            mode={mode}
            label={t("txForm.amountLabel", {
              currency:
                state.accounts.find((a) => a.id === accountId)?.currency ?? "",
            })}
            accessibilityLabel={t("recurringForm.amountA11y")}
            value={amount}
            onChangeText={setAmount}
          />
          <SelectField
            label={t("txForm.account")}
            value={accountId}
            options={state.accounts.map((a) => ({
              value: a.id,
              label: a.name,
              detail: a.currency,
              icon: "credit-card",
            }))}
            onChange={setAccount}
          />
          <Choice
            value={splitting ? "split" : "single"}
            items={[
              { value: "single", label: t("txForm.oneCategory") },
              { value: "split", label: t("txForm.split") },
            ]}
            onChange={(value) => {
              const next = value === "split";
              if (next && parts.length < 2)
                setParts(defaultParts(kind, categoryId));
              setSplitting(next);
            }}
          />
          {splitting ? (
            <SplitEditor
              kind={kind}
              total={amount}
              currency={
                state.accounts.find((a) => a.id === accountId)?.currency ??
                state.settings.currency
              }
              parts={parts}
              onChange={setParts}
            />
          ) : (
            <SelectField
              label={t("txForm.category")}
              value={categoryId}
              options={kindCategories(kind).map((c) => ({
                value: c.id,
                label: c.name,
                icon: c.icon,
              }))}
              onChange={setCategory}
            />
          )}
          <TagsField
            value={tags}
            onChange={setTags}
            draft={tagDraft}
            onDraftChange={setTagDraft}
          />
          <RecurrenceField
            allowNone={false}
            value={frequency}
            onChange={(value) => {
              if (value !== "none") setFrequency(value);
            }}
            interval={interval}
            onIntervalChange={setInterval}
          />
          <DateField
            label={t("recurringForm.nextDate")}
            value={date}
            onChange={setDate}
            minDate={today()}
          />
          <Row style={{ justifyContent: "space-between" }}>
            <Txt>{t("recurring.subscription")}</Txt>
            <Switch
              accessibilityLabel={t("recurring.subscription")}
              value={subscription}
              onValueChange={setSubscription}
              trackColor={{ true: colors.accent }}
            />
          </Row>
          <Row style={{ justifyContent: "space-between" }}>
            <Txt>{t("recurring.active")}</Txt>
            <Switch
              accessibilityLabel={t("recurringForm.activeA11y")}
              value={active}
              onValueChange={setActive}
              trackColor={{ true: colors.accent }}
            />
          </Row>
          <Action
            loading={form.busy}
            onPress={() =>
              void form.run(async () => {
                if (!validDate(date) || date < today())
                  throw new Error(t("recurringForm.dateInvalid"));
                if (!title.trim())
                  throw new Error(t("recurringForm.nameRequired"));
                const amountCents = entryAmount(amount, mode);
                if (amountCents <= 0) throw new Error(t("errors.amountZero"));
                const splits = splitting ? buildSplits(parts, mode) : undefined;
                // Start from the stored rule so fields this form does not
                // edit (note, time, transfer details...) are kept.
                const {
                  intervalDays: _interval,
                  splits: _splits,
                  ...base
                } = rule ?? ({} as Partial<Recurring>);
                const entry: Recurring = {
                  ...base,
                  id: rule?.id ?? id(),
                  title: title.trim(),
                  amount: amountCents,
                  accountId,
                  categoryId: splits?.[0]?.categoryId ?? categoryId,
                  kind,
                  note: rule?.note ?? "",
                  tags: normalizeTags([...tags, ...tagDraft.split(",")]),
                  nextDate: date,
                  anchorDay: Number(date.slice(-2)),
                  frequency,
                  ...(frequency === "custom"
                    ? { intervalDays: Number(interval) }
                    : {}),
                  ...(splits ? { splits } : {}),
                  subscription,
                  active,
                };
                await update((s) =>
                  processRecurring({
                    ...s,
                    recurring: [
                      ...s.recurring.filter((r) => r.id !== entry.id),
                      entry,
                    ],
                  }),
                );
                setNotice(t("recurringForm.saved"));
                onClose();
              })
            }
          >
            {t("recurringForm.save")}
          </Action>
          {rule && (
            <Action secondary onPress={() => setDeleting(true)}>
              {t("recurringForm.stop")}
            </Action>
          )}
        </>
      )}
      <FormError message={form.error} />
    </Sheet>
  );
}

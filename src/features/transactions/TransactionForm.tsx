import { SelectField } from "@/shared/SelectField";
import { DateTimeField } from "@/shared/DateTimeField";
import { RecurrenceField, type RepeatValue } from "@/shared/RecurrenceField";
import { CategoryForm } from "@/features/categories/CategoriesScreen";
import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { useFinance } from "@/features/finance/store";
import {
  duplicateTransaction,
  entryAmount,
  localTime,
  id,
  nextFutureDate,
  normalizeTags,
  saveTransaction,
  today,
  type Kind,
  type Recurring,
  type Transaction,
} from "@/features/finance/model";
import {
  Action,
  Choice,
  Empty,
  Field,
  FormError,
  Sheet,
  Txt,
  useFormAction,
  useTheme,
} from "@/shared/ui";
import { ReceiptField } from "./ReceiptField";
import { deleteReceipt } from "./receipts";
import {
  SplitEditor,
  amountText,
  buildSplits,
  draftParts,
  newPart,
  type SplitDraft,
} from "./SplitEditor";
import { TagsField } from "./TagsField";
import { useT } from "@/shared/i18n/react";

export function TransactionForm({
  transaction,
  initialKind = "expense",
  onClose,
}: {
  transaction?: Transaction;
  initialKind?: Kind;
  onClose: () => void;
}) {
  const { state, update, setNotice } = useFinance();
  const { colors } = useTheme();
  const { t, money } = useT();
  const form = useFormAction();
  const mode = state.settings.numberEntry;
  const [kind, setKind] = useState<Kind>(transaction?.kind ?? initialKind);
  const [amount, setAmount] = useState(
    transaction ? amountText(transaction.amount, mode) : "",
  );
  const [accountId, setAccount] = useState(
    transaction?.accountId ??
      state.accounts.find((a) => a.currency === state.settings.currency)?.id ??
      state.accounts[0]?.id ??
      "",
  );
  const [destinationId, setDestination] = useState(
    transaction?.toAccountId ?? "",
  );
  const [received, setReceived] = useState(
    transaction?.received ? amountText(transaction.received, mode) : "",
  );
  const [categoryId, setCategory] = useState(
    transaction?.categoryId ??
      state.categories.find((c) => c.kind === kind)?.id ??
      "",
  );
  const [splitting, setSplitting] = useState(!!transaction?.splits?.length);
  const [parts, setParts] = useState<SplitDraft[]>(() =>
    draftParts(transaction?.splits, mode),
  );
  const [tags, setTags] = useState<string[]>(transaction?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [receipt, setReceipt] = useState(transaction?.receipt);
  const [title, setTitle] = useState(transaction?.title ?? "");
  const [note, setNote] = useState(transaction?.note ?? "");
  const [date, setDate] = useState(transaction?.date ?? today());
  const [time, setTime] = useState<string | undefined>(
    transaction ? transaction.time : localTime(),
  );
  const [frequency, setFrequency] = useState<RepeatValue>("none");
  const [interval, setInterval] = useState("3");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // A photo picked in this session that has not been saved yet. It is removed
  // if it gets replaced or the form closes without saving.
  const draftReceipt = useRef<string | undefined>(undefined);
  useEffect(
    () => () => {
      deleteReceipt(draftReceipt.current);
      draftReceipt.current = undefined;
    },
    [],
  );
  const changeReceipt = (uri: string | undefined) => {
    if (draftReceipt.current && draftReceipt.current !== uri)
      deleteReceipt(draftReceipt.current);
    draftReceipt.current = uri && uri !== transaction?.receipt ? uri : undefined;
    setReceipt(uri);
  };

  const account = state.accounts.find((a) => a.id === accountId);
  const destination = state.accounts.find((a) => a.id === destinationId);
  const currency = account?.currency ?? state.settings.currency;
  const crossCurrency =
    account && destination && account.currency !== destination.currency;
  const kindCategories = (value: Kind) =>
    state.categories.filter((c) => c.kind === value);
  const defaultParts = (value: Kind, first = "") => {
    const options = kindCategories(value);
    const primary = first || options[0]?.id || "";
    return [
      newPart(primary),
      newPart(options.find((c) => c.id !== primary)?.id ?? ""),
    ];
  };

  const save = () =>
    form.run(async () => {
      const amountCents = entryAmount(amount, mode);
      const ruleId = frequency !== "none" ? id() : undefined;
      const intervalDays = Number(interval);
      if (
        frequency === "custom" &&
        (!Number.isInteger(intervalDays) ||
          intervalDays < 1 ||
          intervalDays > 365)
      )
        throw new Error(t("txForm.intervalError"));
      const splits =
        kind !== "transfer" && splitting ? buildSplits(parts, mode) : undefined;
      const tx: Transaction = {
        id: transaction?.id ?? id(),
        kind,
        amount: amountCents,
        accountId,
        categoryId:
          kind === "transfer" ? "" : (splits?.[0]?.categoryId ?? categoryId),
        title:
          title.trim() || (kind === "transfer" ? t("txForm.transferTitle") : ""),
        note: note.trim(),
        date,
        tags: normalizeTags([...tags, ...tagDraft.split(",")]),
        ...(time ? { time } : {}),
        ...(receipt ? { receipt } : {}),
        ...(splits ? { splits } : {}),
        ...(transaction?.importId ? { importId: transaction.importId } : {}),
        ...(kind === "transfer"
          ? {
              toAccountId: destinationId,
              received: crossCurrency
                ? entryAmount(received, mode)
                : amountCents,
            }
          : {}),
        ...(transaction?.recurringId || ruleId
          ? { recurringId: transaction?.recurringId ?? ruleId }
          : {}),
      };
      await update((current) => {
        const next = saveTransaction(current, tx);
        if (!ruleId || frequency === "none") return next;
        const saved = next.transactions.find((x) => x.id === tx.id) ?? tx;
        const rule: Recurring = {
          id: ruleId,
          kind,
          amount: saved.amount,
          accountId,
          categoryId: saved.categoryId,
          title: saved.title,
          note: saved.note,
          tags: saved.tags ?? [],
          ...(saved.splits ? { splits: saved.splits } : {}),
          ...(kind === "transfer"
            ? { toAccountId: saved.toAccountId, received: saved.received }
            : {}),
          frequency,
          ...(time ? { time } : {}),
          ...(frequency === "custom" ? { intervalDays } : {}),
          nextDate: nextFutureDate(
            date,
            frequency,
            Number(date.slice(-2)),
            today(),
            frequency === "custom" ? intervalDays : 1,
          ),
          anchorDay: Number(date.slice(-2)),
          active: true,
          subscription: false,
        };
        return { ...next, recurring: [...next.recurring, rule] };
      });
      // The new photo is now referenced; drop the one it replaced.
      draftReceipt.current = undefined;
      if (transaction?.receipt && transaction.receipt !== receipt)
        deleteReceipt(transaction.receipt);
      setNotice(t(transaction ? "txForm.updated" : "txForm.added"));
      onClose();
    });

  const remove = () =>
    form.run(async () => {
      await update((s) => ({
        ...s,
        transactions: s.transactions.filter((x) => x.id !== transaction?.id),
      }));
      deleteReceipt(transaction?.receipt);
      setNotice(t("txForm.deleted"));
      onClose();
    });

  const duplicate = () =>
    form.run(async () => {
      if (!transaction) return;
      await update((s) => duplicateTransaction(s, transaction.id));
      setNotice(t("txForm.duplicated"));
      onClose();
    });

  return (
    <Sheet
      title={t(
        deleting
          ? "txForm.deleteTitle"
          : transaction
            ? "txForm.editTitle"
            : "txForm.newTitle",
      )}
      subtitle={t(deleting ? "txForm.deleteSubtitle" : "txForm.subtitle")}
      onClose={onClose}
    >
      {!state.accounts.length ? (
        <Empty
          icon="credit-card"
          title={t("txForm.noAccountTitle")}
          description={t("txForm.noAccountBody")}
          action={t("txForm.noAccountAction")}
          onPress={() => {
            onClose();
            router.push("/accounts");
          }}
        />
      ) : deleting ? (
        <>
          <Txt>
            {transaction?.title} ·{" "}
            {money(transaction?.amount ?? 0, account?.currency ?? "DOP")}
          </Txt>
          {transaction?.receipt && (
            <Txt size={12} color={colors.muted}>
              {t("txForm.deleteReceipt")}
            </Txt>
          )}
          <FormError message={form.error} />
          <Action danger loading={form.busy} onPress={() => void remove()}>
            {t("txForm.delete")}
          </Action>
          <Action secondary onPress={() => setDeleting(false)}>
            {t("txForm.keep")}
          </Action>
        </>
      ) : (
        <>
          <Choice
            value={kind}
            items={[
              { value: "expense", label: t("kind.expense") },
              { value: "income", label: t("kind.income") },
              { value: "transfer", label: t("kind.transfer") },
            ]}
            onChange={(value) => {
              setKind(value);
              const first = kindCategories(value)[0]?.id ?? "";
              setCategory(first);
              if (value === "transfer") setSplitting(false);
              else if (splitting) setParts(defaultParts(value, first));
            }}
          />
          <Field
            label={t("txForm.amountLabel", {
              currency: account?.currency ?? "DOP",
            })}
            accessibilityLabel={t("txForm.amount")}
            placeholder="0.00"
            value={amount}
            onChangeText={setAmount}
            keyboardType={mode === "cents" ? "number-pad" : "decimal-pad"}
            style={{ fontSize: 34, height: 72 }}
          />
          <Field
            label={t("txForm.description")}
            accessibilityLabel={t("txForm.description")}
            placeholder={t(
              kind === "transfer"
                ? "txForm.transferTitle"
                : "txForm.descriptionPlaceholder",
            )}
            maxLength={120}
            value={title}
            onChangeText={setTitle}
          />
          {mode === "cents" && (
            <Txt size={12} color={colors.muted}>
              {t("txForm.digitsEntry", {
                amount: money(Number(amount) || 0, currency),
              })}
            </Txt>
          )}
          <SelectField
            label={t(kind === "transfer" ? "txForm.fromAccount" : "txForm.account")}
            value={accountId}
            onChange={setAccount}
            options={state.accounts.map((a) => ({
              value: a.id,
              label: a.name,
              detail:
                a.currency === state.settings.currency
                  ? t("txForm.defaultCurrency")
                  : t("txForm.amountsIn", { currency: a.currency }),
              icon: a.type === "cash" ? "pocket" : "credit-card",
            }))}
          />
          {account?.currency !== state.settings.currency && (
            <Txt size={11} color={colors.muted}>
              {t("txForm.otherCurrency", { currency: account?.currency ?? "" })}
            </Txt>
          )}
          {kind === "transfer" ? (
            <>
              <SelectField
                label={t("txForm.toAccount")}
                value={destinationId}
                onChange={setDestination}
                options={state.accounts
                  .filter((a) => a.id !== accountId)
                  .map((a) => ({
                    value: a.id,
                    label: a.name,
                    detail: a.currency,
                    icon: "credit-card",
                  }))}
              />
              {crossCurrency && (
                <Field
                  label={t("txForm.receivedLabel", {
                    currency: destination.currency,
                  })}
                  accessibilityLabel={t("txForm.received")}
                  value={received}
                  onChangeText={setReceived}
                  keyboardType={
                    mode === "cents" ? "number-pad" : "decimal-pad"
                  }
                />
              )}
            </>
          ) : (
            <>
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
                  currency={currency}
                  parts={parts}
                  onChange={setParts}
                />
              ) : (
                <SelectField
                  label={t("txForm.category")}
                  value={categoryId}
                  onChange={setCategory}
                  options={kindCategories(kind).map((c) => ({
                    value: c.id,
                    label: c.name,
                    icon: c.icon,
                  }))}
                  onCreate={() => setCreatingCategory(true)}
                />
              )}
            </>
          )}
          <DateTimeField
            date={date}
            time={time}
            onChange={(date, time) => {
              setDate(date);
              setTime(time);
            }}
          />
          <Field
            label={t("txForm.noteLabel")}
            accessibilityLabel={t("txForm.note")}
            placeholder={t("txForm.notePlaceholder")}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={2000}
          />
          <TagsField
            value={tags}
            onChange={setTags}
            draft={tagDraft}
            onDraftChange={setTagDraft}
          />
          <ReceiptField value={receipt} onChange={changeReceipt} />
          {!transaction && (
            <RecurrenceField
              value={frequency}
              onChange={setFrequency}
              interval={interval}
              onIntervalChange={setInterval}
            />
          )}
          {creatingCategory && (
            <CategoryForm
              initialKind={kind === "income" ? "income" : "expense"}
              onSaved={setCategory}
              onClose={() => setCreatingCategory(false)}
            />
          )}
          {transaction?.recurringId && (
            <Txt size={12} color={colors.muted}>
              {t("txForm.occurrenceHint")}
            </Txt>
          )}
          <FormError message={form.error} />
          <Action loading={form.busy} onPress={() => void save()}>
            {t(
              transaction
                ? "common.saveChanges"
                : kind === "transfer"
                  ? "txForm.saveTransfer"
                  : "txForm.save",
            )}
          </Action>
          {transaction && (
            <>
              <Action
                secondary
                disabled={form.busy}
                onPress={() => void duplicate()}
              >
                {t("txForm.duplicate")}
              </Action>
              <Action secondary onPress={() => setDeleting(true)}>
                {t("txForm.delete")}
              </Action>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

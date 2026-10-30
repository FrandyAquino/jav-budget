import { Pressable, View } from "react-native";
import { SelectField } from "@/shared/SelectField";
import { useFinance } from "@/features/finance/store";
import {
  amountText,
  entryAmount,
  id,
  type Currency,
  type Settings,
  type Split,
} from "@/features/finance/model";
import { AmountField, IconButton, Row, Txt, useTheme } from "@/shared/ui";
import { t as tr } from "@/shared/i18n/core";
import { useT } from "@/shared/i18n/react";

export type SplitDraft = { key: string; categoryId: string; amount: string };

export { amountText } from "@/features/finance/model";

// Lenient parse for live feedback; returns undefined for empty or invalid text.
export function tryAmount(text: string, mode: Settings["numberEntry"]) {
  if (!text.trim()) return undefined;
  try {
    return entryAmount(text, mode);
  } catch {
    return undefined;
  }
}

export function draftParts(
  splits: Split[] | undefined,
  mode: Settings["numberEntry"],
): SplitDraft[] {
  return (splits ?? []).map((s) => ({
    key: id(),
    categoryId: s.categoryId,
    amount: amountText(s.amount, mode),
  }));
}

export function newPart(categoryId = ""): SplitDraft {
  return { key: id(), categoryId, amount: "" };
}

// Strict conversion used on save; domain validation (sum, kinds) runs afterwards.
export function buildSplits(
  parts: SplitDraft[],
  mode: Settings["numberEntry"],
): Split[] {
  return parts.map((part, index) => {
    if (!part.categoryId)
      throw new Error(tr("split.chooseCategory", { part: index + 1 }));
    if (!part.amount.trim())
      throw new Error(tr("split.enterAmount", { part: index + 1 }));
    try {
      return {
        categoryId: part.categoryId,
        amount: entryAmount(part.amount, mode),
      };
    } catch (e) {
      throw new Error(
        tr("split.partError", {
          part: index + 1,
          message: (e as Error).message,
        }),
      );
    }
  });
}

export function SplitEditor({
  kind,
  total,
  currency,
  parts,
  onChange,
}: {
  kind: "expense" | "income";
  total: string;
  currency: Currency;
  parts: SplitDraft[];
  onChange: (parts: SplitDraft[]) => void;
}) {
  const { state } = useFinance();
  const { colors } = useTheme();
  const { t, money } = useT();
  const mode = state.settings.numberEntry;
  const categories = state.categories.filter((c) => c.kind === kind);
  const totalCents = tryAmount(total, mode);
  const allocated = parts.reduce(
    (sum, p) => sum + (tryAmount(p.amount, mode) ?? 0),
    0,
  );
  const remaining = (totalCents ?? 0) - allocated;
  const set = (key: string, patch: Partial<SplitDraft>) =>
    onChange(parts.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const fillTarget =
    parts.find((p) => !tryAmount(p.amount, mode)) ?? parts[parts.length - 1];
  const unused = categories.find(
    (c) => !parts.some((p) => p.categoryId === c.id),
  );
  return (
    <View style={{ gap: 12 }}>
      {parts.map((part, index) => (
        <View
          key={part.key}
          style={{
            gap: 10,
            padding: 12,
            borderRadius: 14,
            borderCurve: "continuous",
            borderWidth: 1,
            borderColor: colors.line,
          }}
        >
          <Row style={{ justifyContent: "space-between" }}>
            <Txt size={12} weight="500" color={colors.muted}>
              {t("split.part", { part: index + 1 })}
            </Txt>
            {parts.length > 2 && (
              <IconButton
                icon="x"
                label={t("split.remove", { part: index + 1 })}
                background={colors.input}
                onPress={() => onChange(parts.filter((p) => p.key !== part.key))}
              />
            )}
          </Row>
          <SelectField
            compact
            label={t("split.category", { part: index + 1 })}
            value={part.categoryId}
            onChange={(categoryId) => set(part.key, { categoryId })}
            options={categories
              .filter(
                (c) =>
                  c.id === part.categoryId ||
                  !parts.some((p) => p.categoryId === c.id),
              )
              .map((c) => ({ value: c.id, label: c.name, icon: c.icon }))}
          />
          <AmountField
            mode={mode}
            accessibilityLabel={t("split.amount", { part: index + 1 })}
            placeholder={mode === "cents" ? "0" : "0.00"}
            value={part.amount}
            onChangeText={(amount) => set(part.key, { amount })}
          />
        </View>
      ))}
      <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <Txt
          accessibilityLiveRegion="polite"
          size={12}
          weight="500"
          color={
            totalCents === undefined
              ? colors.muted
              : remaining === 0
                ? colors.accent
                : colors.danger
          }
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {totalCents === undefined
            ? t("split.enterTotal")
            : remaining === 0
              ? t("split.allocated")
              : remaining > 0
                ? t("split.remaining", { amount: money(remaining, currency) })
                : t("split.over", { amount: money(-remaining, currency) })}
        </Txt>
        <Row style={{ gap: 14 }}>
          {totalCents !== undefined && remaining > 0 && fillTarget && (
            <LinkButton
              label={t("split.useRemaining")}
              onPress={() =>
                set(fillTarget.key, {
                  amount: amountText(
                    (tryAmount(fillTarget.amount, mode) ?? 0) + remaining,
                    mode,
                  ),
                })
              }
            />
          )}
          {unused && (
            <LinkButton
              label={t("split.addPart")}
              onPress={() => onChange([...parts, newPart(unused.id)])}
            />
          )}
        </Row>
      </Row>
    </View>
  );
}

function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({ paddingVertical: 6, opacity: pressed ? 0.6 : 1 })}
    >
      <Txt size={12} weight="600" color={colors.accent}>
        {label}
      </Txt>
    </Pressable>
  );
}

import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useFinance } from "@/features/finance/store";
import {
  amountText,
  entryAmount,
  id,
  type Currency,
  type Goal,
} from "@/features/finance/model";
import {
  Action,
  Amount,
  Card,
  Choice,
  Empty,
  Field,
  FormError,
  Icon,
  IconButton,
  Progress,
  Row,
  Screen,
  Sheet,
  Txt,
  useFormAction,
  useTheme,
} from "@/shared/ui";
import { useT } from "@/shared/i18n/react";

export default function GoalsScreen() {
  const { state } = useFinance();
  const { colors } = useTheme();
  const { t, money } = useT();
  const [editing, setEditing] = useState<Goal | "new">();
  return (
    <Screen
      title={t("goals.title")}
      subtitle={t("goals.subtitle")}
      right={
        <IconButton
          icon="x"
          label={t("goals.close")}
          onPress={() => router.back()}
        />
      }
    >
      <Action onPress={() => setEditing("new")}>{t("goals.create")}</Action>
      {state.goals.length ? (
        state.goals.map((goal) => (
          <Pressable
            key={goal.id}
            accessibilityRole="button"
            onPress={() => setEditing(goal)}
          >
            <Card style={{ gap: 20 }}>
              <Row>
                <View
                  style={{
                    backgroundColor: colors.soft,
                    padding: 14,
                    borderRadius: 17,
                  }}
                >
                  <Icon
                    name={goal.saved >= goal.target ? "check" : "target"}
                    color={colors.accent}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt size={19} weight="600">
                    {goal.name}
                  </Txt>
                  <Txt size={12} color={colors.muted}>
                    {goal.saved >= goal.target
                      ? t("goals.done")
                      : t("goals.progress", {
                          percent: Math.round((goal.saved / goal.target) * 100),
                        })}
                  </Txt>
                </View>
                <Icon name="chevron-right" />
              </Row>
              <Row style={{ justifyContent: "space-between" }}>
                <Amount value={goal.saved} currency={goal.currency} size={28} />
                <Txt size={12} color={colors.muted}>
                  {t("home.budget.of", {
                    amount: money(goal.target, goal.currency, true),
                  })}
                </Txt>
              </Row>
              <Progress value={goal.saved / goal.target} />
            </Card>
          </Pressable>
        ))
      ) : (
        <Empty
          icon="target"
          title={t("goals.emptyTitle")}
          description={t("goals.emptyBody")}
        />
      )}
      <Txt color={colors.muted} size={12}>
        {t("goals.footnote")}
      </Txt>
      {editing && (
        <GoalForm
          goal={editing === "new" ? undefined : editing}
          onClose={() => setEditing(undefined)}
        />
      )}
    </Screen>
  );
}
function GoalForm({ goal, onClose }: { goal?: Goal; onClose: () => void }) {
  const { state, update } = useFinance();
  const { t } = useT();
  const form = useFormAction();
  const [name, setName] = useState(goal?.name ?? "");
  const [currency, setCurrency] = useState<Currency>(
    goal?.currency ?? state.settings.currency,
  );
  const mode = state.settings.numberEntry;
  const [target, setTarget] = useState(
    goal ? amountText(goal.target, mode) : "",
  );
  const [saved, setSaved] = useState(goal ? amountText(goal.saved, mode) : "0");
  const [deleting, setDeleting] = useState(false);
  return (
    <Sheet
      title={t(
        deleting
          ? "goalForm.removeTitle"
          : goal
            ? "goalForm.editTitle"
            : "goalForm.newTitle",
      )}
      onClose={onClose}
    >
      {deleting ? (
        <>
          <Txt>
            {t("goalForm.removeBody")}
          </Txt>
          <Action
            danger
            loading={form.busy}
            onPress={() =>
              void form.run(async () => {
                await update((s) => ({
                  ...s,
                  goals: s.goals.filter((g) => g.id !== goal?.id),
                }));
                onClose();
              })
            }
          >
            {t("goalForm.remove")}
          </Action>
          <Action secondary onPress={() => setDeleting(false)}>
            {t("goalForm.keep")}
          </Action>
        </>
      ) : (
        <>
          <Field
            label={t("goalForm.name")}
            accessibilityLabel={t("goalForm.name")}
            placeholder={t("goalForm.namePlaceholder")}
            value={name}
            onChangeText={setName}
            maxLength={80}
          />
          <Choice
            value={currency}
            items={[
              { value: "DOP", label: "DOP" },
              { value: "USD", label: "USD" },
            ]}
            onChange={setCurrency}
          />
          <Field
            label={t("goalForm.target")}
            accessibilityLabel={t("goalForm.target")}
            value={target}
            onChangeText={setTarget}
            keyboardType={mode === "cents" ? "number-pad" : "decimal-pad"}
          />
          <Field
            label={t("goalForm.saved")}
            accessibilityLabel={t("goalForm.savedA11y")}
            value={saved}
            onChangeText={setSaved}
            keyboardType={mode === "cents" ? "number-pad" : "decimal-pad"}
          />
          <Action
            loading={form.busy}
            onPress={() =>
              void form.run(async () => {
                if (!name.trim()) throw new Error(t("goalForm.nameRequired"));
                const targetCents = entryAmount(target, mode);
                if (targetCents <= 0)
                  throw new Error(t("goalForm.targetPositive"));
                const entry = {
                  id: goal?.id ?? id(),
                  name: name.trim(),
                  currency,
                  target: targetCents,
                  saved: entryAmount(saved || "0", mode, true),
                };
                await update((s) => ({
                  ...s,
                  goals: [...s.goals.filter((g) => g.id !== entry.id), entry],
                }));
                onClose();
              })
            }
          >
            {t("goalForm.save")}
          </Action>
          {goal && (
            <Action secondary onPress={() => setDeleting(true)}>
              {t("goalForm.remove")}
            </Action>
          )}
        </>
      )}
      <FormError message={form.error} />
    </Sheet>
  );
}

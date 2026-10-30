import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useFinance } from "@/features/finance/store";
import { categoryInUse, id, type Category } from "@/features/finance/model";
import {
  Action,
  Card,
  Choice,
  Field,
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
import { useT } from "@/shared/i18n/react";
import type { PlainKey } from "@/shared/i18n/core";

const ICONS = [
  "shopping-bag",
  "coffee",
  "home",
  "truck",
  "heart",
  "headphones",
  "briefcase",
  "gift",
  "book",
  "sun",
  "globe",
  "zap",
] as const;
const iconLabel = (icon: (typeof ICONS)[number]): PlainKey =>
  `categoryForm.icon.${icon}`;

export default function CategoriesScreen() {
  const { state } = useFinance();
  const { colors } = useTheme();
  const { t } = useT();
  const [editing, setEditing] = useState<Category | "new">();
  return (
    <Screen
      title={t("categories.title")}
      subtitle={t("categories.subtitle")}
      right={
        <IconButton
          icon="x"
          label={t("categories.close")}
          onPress={() => router.back()}
        />
      }
    >
      <Action onPress={() => setEditing("new")}>{t("categories.add")}</Action>
      {(["expense", "income", "transfer"] as const).map((kind) => (
        <Card key={kind}>
          <Txt size={12} color={colors.muted} style={{ marginBottom: 15 }}>
            {t(
              kind === "expense"
                ? "categories.moneyOut"
                : kind === "income"
                  ? "categories.moneyIn"
                  : "categories.transfers",
            )}
          </Txt>
          {kind === "transfer" &&
            !state.categories.some((c) => c.kind === kind) && (
              <Txt size={13} color={colors.muted}>
                {t("categories.transfersEmpty")}
              </Txt>
            )}
          {state.categories
            .filter((c) => c.kind === kind)
            .map((c) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                onPress={() => setEditing(c)}
                style={{ paddingVertical: 13 }}
              >
                <Row>
                  <View
                    style={{
                      padding: 12,
                      backgroundColor: colors.input,
                      borderRadius: 13,
                    }}
                  >
                    <Icon name={c.icon} color={colors.text} size={18} />
                  </View>
                  <Txt style={{ flex: 1 }} weight="500">
                    {c.name}
                  </Txt>
                  <Icon name="chevron-right" color={colors.muted} size={16} />
                </Row>
              </Pressable>
            ))}
        </Card>
      ))}
      {editing && (
        <CategoryForm
          category={editing === "new" ? undefined : editing}
          onClose={() => setEditing(undefined)}
        />
      )}
    </Screen>
  );
}
export function CategoryForm({
  category,
  onClose,
  onSaved,
  initialKind = "expense",
}: {
  category?: Category;
  onClose: () => void;
  onSaved?: (id: string) => void;
  initialKind?: Category["kind"];
}) {
  const { update, setNotice } = useFinance();
  const { t, locale } = useT();
  const form = useFormAction();
  const [name, setName] = useState(category?.name ?? "");
  const [kind, setKind] = useState<Category["kind"]>(
    category?.kind ?? initialKind,
  );
  const [icon, setIcon] = useState(category?.icon ?? "shopping-bag");
  const [color, setColor] = useState(category?.color ?? "#555B65");
  const [deleting, setDeleting] = useState(false);
  return (
    <Sheet
      title={t(
        deleting
          ? "categoryForm.removeTitle"
          : category
            ? "categoryForm.editTitle"
            : "categoryForm.newTitle",
      )}
      onClose={onClose}
    >
      {deleting ? (
        <>
          <Txt>
            {t("categoryForm.removeBody")}
          </Txt>
          <Action
            danger
            loading={form.busy}
            onPress={() =>
              void form.run(async () => {
                await update((s) => {
                  if (category && categoryInUse(s, category.id))
                    throw new Error(t("categoryForm.inUse"));
                  return {
                    ...s,
                    categories: s.categories.filter(
                      (c) => c.id !== category?.id,
                    ),
                  };
                });
                onClose();
              })
            }
          >
            {t("categoryForm.remove")}
          </Action>
          <Action secondary onPress={() => setDeleting(false)}>
            {t("categoryForm.keep")}
          </Action>
        </>
      ) : (
        <>
          <Field
            label={t("categoryForm.name")}
            accessibilityLabel={t("categoryForm.name")}
            value={name}
            onChangeText={setName}
            maxLength={60}
          />
          <Choice
            value={kind}
            items={[
              { value: "expense", label: t("kind.expense") },
              { value: "income", label: t("kind.income") },
              { value: "transfer", label: t("kind.transfer") },
            ]}
            onChange={setKind}
          />
          <Txt size={12}>{t("categoryForm.icon")}</Txt>
          <Row style={{ flexWrap: "wrap" }}>
            {ICONS.map((value) => (
              <IconButton
                key={value}
                icon={value}
                label={t(iconLabel(value))}
                background={icon === value ? `${color}40` : `${color}12`}
                onPress={() => setIcon(value)}
              />
            ))}
          </Row>
          <Txt size={12}>{t("categoryForm.color")}</Txt>
          <Row>
            {[
              "#555B65",
              "#7E8791",
              "#466477",
              "#687666",
              "#8A7264",
              "#7F6A7E",
            ].map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityLabel={t("categoryForm.colorA11y", {
                  color: value,
                })}
                onPress={() => setColor(value)}
                style={{
                  width: 36,
                  height: 36,
                  backgroundColor: value,
                  borderRadius: 18,
                  borderWidth: color === value ? 3 : 0,
                  borderColor: "#FFFFFF",
                  outlineWidth: color === value ? 2 : 0,
                  outlineColor: value,
                }}
              />
            ))}
          </Row>
          <Action
            loading={form.busy}
            onPress={() =>
              void form.run(async () => {
                if (!name.trim()) throw new Error(t("categoryForm.nameRequired"));
                const entry = {
                  id: category?.id ?? id(),
                  name: name.trim(),
                  kind,
                  icon,
                  color,
                };
                await update((s) => {
                  if (
                    category &&
                    category.kind !== kind &&
                    categoryInUse(s, category.id)
                  )
                    throw new Error(t("categoryForm.kindInUse"));
                  if (
                    s.categories.some(
                      (c) =>
                        c.id !== entry.id &&
                        c.kind === kind &&
                        c.name.toLocaleLowerCase(locale) ===
                          entry.name.toLocaleLowerCase(locale),
                    )
                  )
                    throw new Error(t("categoryForm.duplicate"));
                  return {
                    ...s,
                    categories: [
                      ...s.categories.filter((c) => c.id !== entry.id),
                      entry,
                    ],
                  };
                });
                setNotice(t("categoryForm.saved"));
                onSaved?.(entry.id);
                onClose();
              })
            }
          >
            {t("categoryForm.save")}
          </Action>
          {category && (
            <Action secondary onPress={() => setDeleting(true)}>
              {t("categoryForm.remove")}
            </Action>
          )}
        </>
      )}
      <FormError message={form.error} />
    </Sheet>
  );
}

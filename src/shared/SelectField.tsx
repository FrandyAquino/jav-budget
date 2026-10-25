import { useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Field, Icon, IconButton, Row, Txt, tap, useTheme } from "./ui";
import { useT } from "./i18n/react";
import { foldText } from "./i18n/format";

export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
  detail?: string;
  icon?: string;
};
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder,
  onCreate,
  compact = false,
}: {
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  onCreate?: () => void;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  const { height } = useWindowDimensions();
  const empty = placeholder ?? t("common.choose");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((o) => o.value === value);
  const matches = options.filter((o) =>
    foldText(`${o.label} ${o.detail ?? ""}`).includes(foldText(search)),
  );
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("common.selectValue", {
          label,
          value: selected?.label ?? empty,
        })}
        onPress={() => {
          tap();
          setSearch("");
          setOpen(true);
        }}
        style={({ pressed }) => ({
          minHeight: compact ? 44 : 62,
          opacity: pressed ? 0.6 : 1,
          paddingVertical: 12,
          paddingHorizontal: 14,
          backgroundColor: colors.input,
          borderRadius: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        })}
      >
        <Icon
          name={selected?.icon ?? (compact ? "filter" : "chevrons-down")}
          size={18}
          color={colors.muted}
        />
        <View style={{ flex: 1, gap: 3 }}>
          {!compact && (
            <Txt size={11} color={colors.muted}>
              {label}
            </Txt>
          )}
          <Txt weight="500" numberOfLines={1}>
            {selected?.label ?? empty}
          </Txt>
        </View>
        <Icon name="chevron-down" size={16} color={colors.muted} />
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "#00000060",
          }}
        >
          <Pressable
            accessibilityLabel={t("common.closeLabel", { label })}
            onPress={() => setOpen(false)}
            style={{ flex: 1 }}
          />
          <SafeAreaView
            edges={["bottom"]}
            style={{
              height: Math.min(height * 0.78, 650),
              width: "100%",
              maxWidth: 560,
              alignSelf: "center",
              backgroundColor: colors.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 20,
            }}
          >
            <Row style={{ justifyContent: "space-between", marginBottom: 16 }}>
              <Txt size={22} weight="600">
                {label}
              </Txt>
              <IconButton
                label={t("common.closeList", { label })}
                icon="x"
                onPress={() => setOpen(false)}
              />
            </Row>
            <Field
              accessibilityLabel={t("common.searchFor", { label })}
              placeholder={t("common.searchPlaceholder", {
                label: label.toLocaleLowerCase(locale),
              })}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
            />
            <FlatList
              style={{ flex: 1, marginTop: 12 }}
              data={matches}
              keyExtractor={(o) => o.value}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={20}
              maxToRenderPerBatch={20}
              windowSize={7}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: item.value === value }}
                  onPress={() => {
                    tap();
                    onChange(item.value);
                    setOpen(false);
                  }}
                  style={{
                    minHeight: 58,
                    paddingVertical: 14,
                    borderBottomWidth: 1,
                    borderColor: colors.line,
                  }}
                >
                  <Row>
                    <Icon
                      name={item.icon ?? "circle"}
                      size={19}
                      color={colors.text}
                    />
                    <View style={{ flex: 1 }}>
                      <Txt weight="500">{item.label}</Txt>
                      {item.detail && (
                        <Txt size={12} color={colors.muted}>
                          {item.detail}
                        </Txt>
                      )}
                    </View>
                    {item.value === value && <Icon name="check" size={18} />}
                  </Row>
                </Pressable>
              )}
              ListEmptyComponent={
                <Txt color={colors.muted} style={{ paddingVertical: 24 }}>
                  {options.length === 0 && onCreate
                    ? t("common.noCategoriesYet")
                    : t("common.noMatches")}
                </Txt>
              }
            />
            {onCreate && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setOpen(false);
                  onCreate();
                }}
                style={{ paddingVertical: 18 }}
              >
                <Row>
                  <Icon name="plus" />
                  <Txt weight="600">{t("common.createCategory")}</Txt>
                </Row>
              </Pressable>
            )}
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

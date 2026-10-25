import { Pressable, View } from "react-native";
import { useFinance } from "@/features/finance/store";
import {
  allTags,
  MAX_TAG_LENGTH,
  MAX_TAGS,
  normalizeTag,
  normalizeTags,
} from "@/features/finance/model";
import { Field, Icon, Row, Txt, tap, useTheme } from "@/shared/ui";
import { useT } from "@/shared/i18n/react";

const SUGGESTIONS = 6;

// Adds `text` to `tags`, respecting the domain limits. Returns the new list.
export function addTags(tags: string[], text: string) {
  return normalizeTags([...tags, ...text.split(",")])
    .filter((t) => t.length <= MAX_TAG_LENGTH)
    .slice(0, MAX_TAGS);
}

export function TagsField({
  value,
  onChange,
  draft,
  onDraftChange,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  // The text being typed is lifted so the form can keep an unsubmitted tag on save.
  draft: string;
  onDraftChange: (text: string) => void;
}) {
  const { state } = useFinance();
  const { colors } = useTheme();
  const { t } = useT();
  const full = value.length >= MAX_TAGS;
  const query = normalizeTag(draft);
  const suggestions = full
    ? []
    : allTags(state)
        .filter(
          (tag) => !value.includes(tag) && (!query || tag.startsWith(query)),
        )
        .slice(0, SUGGESTIONS);
  const commit = (text: string) => {
    if (normalizeTag(text)) onChange(addTags(value, text));
    onDraftChange("");
  };
  return (
    <View style={{ gap: 10 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Txt size={12} weight="500">
          {t("tags.label")}
        </Txt>
        <Txt size={11} color={colors.muted}>
          {value.length}/{MAX_TAGS}
        </Txt>
      </Row>
      {value.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {value.map((tag) => (
            <Pressable
              key={tag}
              accessibilityRole="button"
              accessibilityLabel={t("tags.remove", { tag })}
              onPress={() => {
                tap();
                onChange(value.filter((other) => other !== tag));
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                minHeight: 34,
                paddingLeft: 12,
                paddingRight: 10,
                borderRadius: 100,
                backgroundColor: colors.soft,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Txt size={12} weight="500">
                #{tag}
              </Txt>
              <Icon name="x" size={13} color={colors.muted} />
            </Pressable>
          ))}
        </View>
      )}
      {!full && (
        <Field
          accessibilityLabel={t("tags.add")}
          placeholder={t("tags.placeholder")}
          value={draft}
          maxLength={MAX_TAG_LENGTH + 1}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          submitBehavior="submit"
          onChangeText={(text) => {
            if (!text.includes(",")) return onDraftChange(text);
            const parts = text.split(",");
            const rest = parts.pop() ?? "";
            onChange(addTags(value, parts.join(",")));
            onDraftChange(rest);
          }}
          onSubmitEditing={() => commit(draft)}
        />
      )}
      {query.length > MAX_TAG_LENGTH && (
        <Txt size={11} color={colors.danger}>
          {t("errors.tagLength", { max: MAX_TAG_LENGTH })}
        </Txt>
      )}
      {suggestions.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {suggestions.map((tag) => (
            <Pressable
              key={tag}
              accessibilityRole="button"
              accessibilityLabel={t("tags.addNamed", { tag })}
              onPress={() => {
                tap();
                commit(tag);
              }}
              style={({ pressed }) => ({
                minHeight: 34,
                paddingHorizontal: 12,
                justifyContent: "center",
                borderRadius: 100,
                borderWidth: 1,
                borderColor: colors.line,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Txt size={12} color={colors.muted}>
                + {tag}
              </Txt>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

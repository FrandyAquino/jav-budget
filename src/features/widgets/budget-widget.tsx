// Registered as `ios.initialLayout` in app.json. Keep this file self-contained:
// the widget body runs in an isolated runtime (no app imports, hooks or
// module-scope values) and the layout registry only resolves expo-widgets.
import { HStack, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  font,
  foregroundStyle,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";
import type { BudgetWidgetProps } from "./snapshot";

const BudgetWidget = (
  props: BudgetWidgetProps,
  environment: WidgetEnvironment,
) => {
  "widget";
  const secondary = foregroundStyle({
    type: "hierarchical",
    style: "secondary",
  });
  const caption = font({ textStyle: "caption", weight: "medium" });
  const budgetStyle = props.budgetOver
    ? foregroundStyle("#E03131")
    : props.hasBudget
      ? foregroundStyle("#2F9E44")
      : secondary;

  const spending = (
    <VStack alignment="leading" spacing={2}>
      <Text modifiers={[caption, secondary]}>
        {props.title}
      </Text>
      <Text
        modifiers={[
          font({ size: 26, weight: "semibold", design: "rounded" }),
          monospacedDigit(),
          lineLimit(1),
          minimumScaleFactor(0.5),
        ]}
      >
        {props.spent}
      </Text>
      <Text
        modifiers={[
          font({ textStyle: "footnote", weight: "medium" }),
          budgetStyle,
          lineLimit(1),
          minimumScaleFactor(0.7),
        ]}
      >
        {props.hasBudget ? props.budget : props.noBudgetLabel}
      </Text>
    </VStack>
  );
  const worth = (
    <VStack alignment="leading" spacing={2}>
      <Text modifiers={[caption, secondary]}>{props.netWorthLabel}</Text>
      <Text
        modifiers={[
          font({ textStyle: "headline", design: "rounded" }),
          monospacedDigit(),
          lineLimit(1),
          minimumScaleFactor(0.5),
        ]}
      >
        {props.netWorth}
      </Text>
      {props.netWorthAlt ? (
        <Text
          modifiers={[
            font({ textStyle: "headline", design: "rounded" }),
            monospacedDigit(),
            lineLimit(1),
            minimumScaleFactor(0.5),
          ]}
        >
          {props.netWorthAlt}
        </Text>
      ) : (
        <Spacer />
      )}
    </VStack>
  );

  if (environment.widgetFamily === "systemMedium") {
    return (
      <HStack spacing={16} modifiers={[widgetURL("javbudget:///")]}>
        {spending}
        <Spacer />
        {worth}
      </HStack>
    );
  }
  return (
    <HStack modifiers={[widgetURL("javbudget:///")]}>
      <VStack alignment="leading" spacing={8}>
        {spending}
        <Spacer />
        {worth}
      </VStack>
      <Spacer />
    </HStack>
  );
};

// Placeholder until the app pushes its first (localized) snapshot.
export default createWidget("BudgetWidget", BudgetWidget, {
  title: "",
  noBudgetLabel: "",
  netWorthLabel: "",
  spent: "—",
  hasBudget: false,
  budget: "",
  budgetOver: false,
  netWorth: "—",
  netWorthAlt: "",
});

import { useColorScheme } from "react-native";
import { useFinance } from "@/features/finance/store";

const light = {
  bg: "#F4F4F5",
  surface: "#FFFFFF",
  text: "#222428",
  muted: "#73767D",
  line: "#E4E5E7",
  accent: "#30343B",
  soft: "#ECEDEF",
  hero: "#FFFFFF",
  danger: "#B8594C",
  orange: "#B48342",
  input: "#F0F1F3",
};
const dark: typeof light = {
  bg: "#111214",
  surface: "#1C1E22",
  text: "#F2F2F3",
  muted: "#A3A6AE",
  line: "#303238",
  accent: "#D6D9DF",
  soft: "#282B31",
  hero: "#1C1E22",
  danger: "#EF9F92",
  orange: "#DDB577",
  input: "#25272C",
};
export type ThemeColors = typeof light;
export function useTheme() {
  const { state } = useFinance();
  const system = useColorScheme();
  const isDark =
    state.settings.appearance === "dark" ||
    (state.settings.appearance === "system" && system === "dark");
  return { colors: isDark ? dark : light, isDark };
}

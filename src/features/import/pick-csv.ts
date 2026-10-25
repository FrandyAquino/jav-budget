import { Platform } from "react-native";
import { t } from "@/shared/i18n/core";

export const MAX_CSV_BYTES = 5_000_000;

// Same file API as the JSON backup import: web File on web, expo-file-system File elsewhere.
export async function pickCsv(): Promise<
  { name: string; text: string } | undefined
> {
  const picker = await import("expo-document-picker");
  const result = await picker.getDocumentAsync({
    type: [
      "text/csv",
      "text/comma-separated-values",
      "application/csv",
      "application/vnd.ms-excel",
      "text/plain",
    ],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return;
  const asset = result.assets[0];
  if ((asset.size ?? 0) > MAX_CSV_BYTES)
    throw new Error(t("import.tooLarge"));
  let text: string;
  if (Platform.OS === "web" && asset.file) text = await asset.file.text();
  else {
    const { File } = await import("expo-file-system");
    text = await new File(asset.uri).text();
  }
  if (text.length > MAX_CSV_BYTES)
    throw new Error(t("import.tooLarge"));
  return { name: asset.name, text };
}

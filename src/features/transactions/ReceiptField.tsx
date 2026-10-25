import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  FormError,
  Icon,
  IconButton,
  Row,
  Txt,
  tap,
  useTheme,
} from "@/shared/ui";
import { persistReceipt, receiptsPersist, resolveReceipt } from "./receipts";
import { useT } from "@/shared/i18n/react";

const canUseCamera = process.env.EXPO_OS !== "web";

export function ReceiptField({
  value,
  onChange,
}: {
  value?: string;
  onChange: (uri: string | undefined) => void;
}) {
  const { colors } = useTheme();
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState(false);
  const [broken, setBroken] = useState(false);
  const source = (value && resolveReceipt(value)) || undefined;

  const choose = async (from: "library" | "camera") => {
    if (busy) return;
    setError("");
    try {
      if (from === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError(
            t("receipt.cameraDenied"),
          );
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: "images",
        allowsEditing: false,
        quality: 0.7,
      };
      const result =
        from === "camera"
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      const asset = result.canceled ? undefined : result.assets[0];
      if (!asset) return;
      setBusy(true);
      const uri = await persistReceipt(asset.uri);
      setBroken(false);
      onChange(uri);
    } catch {
      setError(t("receipt.attachFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <Txt size={12} weight="500">
        {t("receipt.label")}
      </Txt>
      {source ? (
        <Row style={{ alignItems: "center" }}>
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel={t("receipt.view")}
            onPress={() => {
              tap();
              setViewing(true);
            }}
            disabled={broken}
            style={({ pressed }) => ({
              width: 64,
              height: 64,
              borderRadius: 12,
              borderCurve: "continuous",
              overflow: "hidden",
              backgroundColor: colors.input,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            {broken ? (
              <Icon name="image" color={colors.muted} />
            ) : (
              <Image
                source={{ uri: source }}
                style={{ width: 64, height: 64 }}
                contentFit="cover"
                transition={150}
                onError={() => setBroken(true)}
              />
            )}
          </Pressable>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt size={13} weight="500">
              {t(broken ? "receipt.unavailable" : "receipt.attached")}
            </Txt>
            <Txt size={11} color={colors.muted}>
              {t(broken ? "receipt.missingFile" : "receipt.tapToView")}
            </Txt>
          </View>
          <IconButton
            icon="trash-2"
            label={t("receipt.remove")}
            background={colors.input}
            onPress={() => {
              setBroken(false);
              onChange(undefined);
            }}
          />
        </Row>
      ) : (
        <Row style={{ flexWrap: "wrap", gap: 8 }}>
          <ReceiptButton
            icon="image"
            label={t(busy ? "receipt.attaching" : "receipt.choose")}
            onPress={() => void choose("library")}
          />
          {canUseCamera && (
            <ReceiptButton
              icon="camera"
              label={t("receipt.take")}
              onPress={() => void choose("camera")}
            />
          )}
        </Row>
      )}
      {!receiptsPersist && source && (
        <Txt size={11} color={colors.muted}>
          {t("receipt.webHint")}
        </Txt>
      )}
      <FormError message={error} />
      {viewing && source && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setViewing(false)}
        >
          <SafeAreaView
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)" }}
          >
            <Row style={{ justifyContent: "flex-end", padding: 16 }}>
              <IconButton
                icon="x"
                label={t("receipt.close")}
                onPress={() => setViewing(false)}
              />
            </Row>
            <Image
              source={{ uri: source }}
              style={{ flex: 1, margin: 16 }}
              contentFit="contain"
              accessibilityLabel={t("receipt.photo")}
            />
          </SafeAreaView>
        </Modal>
      )}
    </View>
  );
}

function ReceiptButton({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        minHeight: 44,
        paddingHorizontal: 14,
        borderRadius: 12,
        borderCurve: "continuous",
        backgroundColor: colors.input,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <Icon name={icon} size={16} color={colors.muted} />
      <Txt size={13} weight="500">
        {label}
      </Txt>
    </Pressable>
  );
}

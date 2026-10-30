import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Action, Field, FormError, Row, Txt, tap, useTheme } from "@/shared/ui";
import { useT } from "@/shared/i18n/react";
import { sendCode, signInWithGoogle, SyncAuthError, verifyCode } from "./engine";

const RESEND_SECONDS = 60;

// Built-in email provider sends links; custom templates may send six-digit codes.
// Signing up and signing in are the same flow (shouldCreateUser).
export function SignInForm({ onSignedIn }: { onSignedIn?: () => void }) {
  const { colors } = useTheme();
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(t(`auth.error.${e instanceof SyncAuthError ? e.code : "failed"}`));
    } finally {
      setBusy(false);
    }
  };
  const send = () =>
    run(async () => {
      await sendCode(email);
      setSentTo(email.trim());
      setCode("");
      setCooldown(RESEND_SECONDS);
    });
  if (!sentTo)
    return (
      <>
        <GoogleButton
          label={t("account.google")}
          busy={busy}
          onPress={() => void run(async () => {
            if (await signInWithGoogle()) onSignedIn?.();
          })}
        />
        <Row style={{ gap: 12 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
          <Txt size={12} color={colors.muted}>{t("account.orEmail")}</Txt>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
        </Row>
        <Field
          label={t("account.email")}
          accessibilityLabel={t("account.emailA11y")}
          value={email}
          onChangeText={setEmail}
          placeholder={t("account.emailPlaceholder")}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          maxLength={120}
          onSubmitEditing={() => void send()}
        />
        <FormError message={error} />
        <Action loading={busy} disabled={!email.trim()} onPress={() => void send()}>
          {t("account.sendCode")}
        </Action>
      </>
    );
  return (
    <>
      <Txt size={13} color={colors.muted}>
        {t("account.codeSent", { email: sentTo })}
      </Txt>
      <Field
        label={t("account.code")}
        accessibilityLabel={t("account.codeA11y")}
        value={code}
        onChangeText={setCode}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={4096}
        placeholder="https://…"
      />
      <FormError message={error} />
      <Action
        loading={busy}
        disabled={!code.trim()}
        onPress={() =>
          void run(async () => {
            await verifyCode(sentTo, code);
            onSignedIn?.();
          })
        }
      >
        {t("account.verify")}
      </Action>
      <Action secondary disabled={busy || cooldown > 0} onPress={() => void send()}>
        {cooldown > 0 ? t("account.resendIn", { seconds: cooldown }) : t("account.resend")}
      </Action>
      <Action
        secondary
        disabled={busy}
        onPress={() => {
          setSentTo("");
          setCode("");
          setError("");
        }}
      >
        {t("account.changeEmail")}
      </Action>
    </>
  );
}

// Google's sign-in branding: white button, multicolor "G", in both themes.
function GoogleButton({ label, busy, onPress }: { label: string; busy: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: 49,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: "#DADCE0",
        backgroundColor: pressed ? "#F1F3F4" : "#FFFFFF",
        alignItems: "center",
        justifyContent: "center",
        opacity: busy ? 0.7 : 1,
      })}
    >
      <Row style={{ gap: 10 }}>
        {busy ? (
          <ActivityIndicator size="small" color="#3C4043" />
        ) : (
          <Svg width={18} height={18} viewBox="0 0 48 48">
            <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </Svg>
        )}
        <Txt size={15} weight="600" color="#1F1F1F">
          {label}
        </Txt>
      </Row>
    </Pressable>
  );
}

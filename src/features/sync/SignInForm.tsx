import { useEffect, useState } from "react";
import { Action, Field, FormError, Txt, useTheme } from "@/shared/ui";
import { useT } from "@/shared/i18n/react";
import { sendCode, SyncAuthError, verifyCode } from "./engine";

const RESEND_SECONDS = 60;

// Email one-time code sign-in: email -> "Send code" -> 6-digit code -> verify.
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
        onChangeText={(text) => setCode(text.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        placeholder="123456"
      />
      <FormError message={error} />
      <Action
        loading={busy}
        disabled={code.length !== 6}
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

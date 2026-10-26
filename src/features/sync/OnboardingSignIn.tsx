import { useState } from "react";
import { Pressable } from "react-native";
import { Sheet, Txt, useTheme } from "@/shared/ui";
import { useT } from "@/shared/i18n/react";
import { syncConfigured } from "./config";
import { SignInForm } from "./SignInForm";
import { useSyncStatus } from "./status";

// "I already have an account" on the onboarding welcome step: signing in
// downloads the cloud data, which finishes the onboarding by itself.
export function OnboardingSignIn() {
  const { colors } = useTheme();
  const { t } = useT();
  const { user, phase } = useSyncStatus();
  const [open, setOpen] = useState(false);
  // Signed in with an empty cloud: continue the setup (it syncs when done).
  if (!syncConfigured || (user && phase !== "syncing")) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={{ alignSelf: "center", minHeight: 44, justifyContent: "center", paddingHorizontal: 12 }}
      >
        <Txt size={13} weight="500" color={colors.accent}>
          {user && phase === "syncing" ? t("account.status.syncing") : t("onboarding.signIn")}
        </Txt>
      </Pressable>
      {open && !user ? (
        <Sheet
          title={t("onboarding.signInTitle")}
          subtitle={t("onboarding.signInBody")}
          onClose={() => setOpen(false)}
        >
          <SignInForm onSignedIn={() => setOpen(false)} />
        </Sheet>
      ) : null}
    </>
  );
}

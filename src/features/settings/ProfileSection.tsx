import { useState } from "react";
import { useFinance } from "@/features/finance/store";
import {
  Action,
  Card,
  Field,
  FormError,
  Section,
  useFormAction,
} from "@/shared/ui";
import { useT } from "@/shared/i18n/react";

// Drafts are initialized from the stored profile; remount (key) to reset them.
export function ProfileSection() {
  const { state, update, setNotice } = useFinance();
  const form = useFormAction();
  const { t } = useT();
  const [name, setName] = useState(state.settings.name);
  const [email, setEmail] = useState(state.settings.email ?? "");
  return (
    <Card style={{ gap: 18 }}>
      <Section title={t("profile.title")} />
      <Field
        label={t("profile.name")}
        accessibilityLabel={t("profile.nameA11y")}
        value={name}
        onChangeText={setName}
        placeholder={t("profile.namePlaceholder")}
        maxLength={60}
      />
      <Field
        label={t("profile.email")}
        accessibilityLabel={t("profile.emailA11y")}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        maxLength={120}
        placeholder={t("profile.emailPlaceholder")}
      />
      <FormError message={form.error} />
      <Action
        loading={form.busy}
        onPress={() =>
          void form.run(async () => {
            await update((s) => ({
              ...s,
              settings: {
                ...s.settings,
                name: name.trim(),
                email: email.trim(),
              },
            }));
            setNotice(t("profile.saved"));
          })
        }
      >
        {t("profile.save")}
      </Action>
    </Card>
  );
}

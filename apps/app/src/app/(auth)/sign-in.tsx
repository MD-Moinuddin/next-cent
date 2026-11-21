import { useSignIn } from "@clerk/expo/legacy";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { t } from "@/i18n/strings";

export default function SignIn() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!isLoaded) return;
    setBusy(true);
    setError(undefined);
    try {
      const res = await signIn.create({ identifier: email.trim(), password });
      if (res.status === "complete") {
        await setActive({ session: res.createdSessionId });
        router.replace("/");
      } else setError(t.errors.generic);
    } catch {
      setError(t.errors.generic);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        {t.app.name}
      </Text>
      <Text tone="muted">{t.auth.tagline}</Text>
      <TextField
        label={t.auth.email}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        textContentType="emailAddress"
        testID="sign-in-email"
      />
      <TextField
        label={t.auth.password}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        error={error}
        testID="sign-in-password"
      />
      <Button
        label={t.auth.signIn}
        onPress={submit}
        loading={busy}
        testID="sign-in-submit"
      />
      <Link href="/sign-up">
        <Text tone="muted">{t.auth.noAccount}</Text>
      </Link>
    </Screen>
  );
}

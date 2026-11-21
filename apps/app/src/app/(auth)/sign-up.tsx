import { useSignUp } from "@clerk/expo/legacy";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { t } from "@/i18n/strings";

export default function SignUp() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function start() {
    if (!isLoaded) return;
    setBusy(true);
    setError(undefined);
    try {
      await signUp.create({ emailAddress: email.trim(), password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
    } catch {
      setError(t.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!isLoaded) return;
    setBusy(true);
    setError(undefined);
    try {
      const res = await signUp.attemptEmailAddressVerification({
        code: code.trim(),
      });
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
        {t.auth.signUp}
      </Text>
      {pendingVerification ? (
        <>
          <TextField
            label={t.auth.code}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            error={error}
            testID="sign-up-code"
          />
          <Button
            label={t.auth.verify}
            onPress={verify}
            loading={busy}
            testID="sign-up-verify"
          />
        </>
      ) : (
        <>
          <TextField
            label={t.auth.email}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            testID="sign-up-email"
          />
          <TextField
            label={t.auth.password}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="newPassword"
            error={error}
            testID="sign-up-password"
          />
          <Button
            label={t.auth.signUp}
            onPress={start}
            loading={busy}
            testID="sign-up-submit"
          />
        </>
      )}
      <Link href="/sign-in">
        <Text tone="muted">{t.auth.haveAccount}</Text>
      </Link>
    </Screen>
  );
}

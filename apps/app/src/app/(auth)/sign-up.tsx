import { useSignUp } from "@clerk/expo/legacy";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { t } from "@/i18n/strings";
import { clerkErrorMessage } from "@/lib/auth/clerkError";
import { useTheme } from "@/theme/useTheme";

export default function SignUp() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const router = useRouter();
  const { colors } = useTheme();
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
    } catch (e) {
      setError(clerkErrorMessage(e) ?? t.errors.generic);
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
    } catch (e) {
      setError(clerkErrorMessage(e) ?? t.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t.auth.signUp}>
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
        <Text
          style={{
            color: colors.brand,
            fontWeight: "600",
            paddingVertical: 12,
          }}
        >
          {t.auth.haveAccount}
        </Text>
      </Link>
    </AuthShell>
  );
}

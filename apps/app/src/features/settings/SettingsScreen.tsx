import { minorToDecimalString } from "@nextcent/shared";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useMe } from "@/features/me/hooks";
import { OnboardingForm } from "@/features/onboarding/OnboardingForm";
import { t } from "@/i18n/strings";
import { api } from "@/lib/api";
import { useSession } from "@/lib/auth/session";
import { useMoney } from "@/lib/format";
import { labelInName } from "@/lib/a11yLabel";
import { clearLocalData, discardQueuedMutations } from "@/lib/query/clear";
import { NetworkError } from "@/lib/query/errors";
import { useTheme } from "@/theme/useTheme";
import { confirmDestructive } from "./confirm";
import { exportCsv } from "./exportCsv";

export function SettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSession();
  const toast = useToast();
  const money = useMoney();
  const { colors } = useTheme();
  const me = useMe();
  const [profileOpen, setProfileOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  // One in-flight account action at a time. The ref closes the gap between a tap and the re-render,
  // so two quick taps cannot stack two confirms or two deletions.
  async function exclusive(fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const doExport = () =>
    exclusive(async () => {
      setExporting(true);
      try {
        await exportCsv();
      } catch (e) {
        toast.show({
          message:
            e instanceof NetworkError
              ? t.common.offlineOnly
              : t.errors.exportFailed,
        });
      } finally {
        setExporting(false);
      }
    });

  const signOut = () =>
    exclusive(async () => {
      setError(null);
      try {
        await session.signOut(); // also clears local data
        router.replace("/sign-in");
      } catch {
        setError(t.errors.signOutFailed);
      }
    });

  const deleteAccount = () =>
    exclusive(async () => {
      setError(null);
      // Deleting needs the server, and it discards the queued writes first: never discard them
      // for a deletion that cannot happen now.
      if (!onlineManager.isOnline()) {
        setError(t.common.offlineOnly);
        return;
      }
      if (!(await confirmDestructive(t.settings.confirmDelete))) return;
      // Queued offline writes would otherwise replay after the deletion and re-create a profile
      // (the API provisions a user on first request). Drop them first; the session stays signed in.
      await discardQueuedMutations(queryClient);
      try {
        await api.deleteMe();
      } catch (e) {
        // The account stays; show the server's state instead of the discarded optimistic rows.
        void queryClient.invalidateQueries({ queryKey: ["transactions"] });
        void queryClient.invalidateQueries({ queryKey: ["summary"] });
        setError(
          e instanceof NetworkError
            ? t.common.offlineOnly
            : t.errors.deleteFailed,
        );
        return;
      }
      try {
        await session.deleteAuthAccount(); // also clears local data
      } catch {
        // The server data is gone but the login remains. Sign out so the live session cannot
        // re-provision an empty account. The wrapper clears local data when it succeeds; if it
        // fails, clear here. Either way tell the user and leave this screen.
        try {
          await session.signOut();
        } catch {
          await clearLocalData();
        }
        toast.show({ message: t.errors.authDeleteFailed });
      }
      router.replace("/sign-in");
    });

  const profile = me.data;
  const openProfile = () => setProfileOpen(true);

  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        {t.settings.title}
      </Text>

      <Text variant="label" tone="muted" accessibilityRole="header">
        {t.settings.profile}
      </Text>
      <Card style={{ padding: 0 }}>
        <Row
          testID="settings-currency"
          label={t.settings.homeCurrency}
          value={profile?.home_currency ?? "—"}
          onPress={profile ? openProfile : undefined}
        />
        <Row
          testID="settings-opening"
          label={t.settings.openingBalance}
          value={
            profile
              ? money.format(
                  profile.opening_balance_minor ?? 0,
                  profile.home_currency,
                )
              : "—"
          }
          onPress={profile ? openProfile : undefined}
        />
        <Row
          testID="settings-income"
          label={t.settings.monthlyIncome}
          value={
            profile?.monthly_income_minor
              ? money.format(
                  profile.monthly_income_minor,
                  profile.home_currency,
                )
              : t.settings.notSet
          }
          onPress={profile ? openProfile : undefined}
          last
        />
      </Card>

      <Card style={{ padding: 0 }}>
        <Row
          testID="settings-categories"
          label={t.settings.categories}
          value={t.settings.manage}
          onPress={() => router.push("/categories")}
        />
        <Row
          testID="settings-recurring"
          label={t.settings.recurring}
          value={t.settings.manage}
          onPress={() => router.push("/recurring")}
        />
        <Row
          label={t.settings.appearance}
          value={t.settings.followsSystem}
          last
        />
      </Card>

      <Text variant="label" tone="muted" accessibilityRole="header">
        {t.settings.data}
      </Text>
      <Button
        testID="settings-export"
        label={exporting ? t.settings.exporting : t.settings.exportCsv}
        variant="ghost"
        loading={exporting}
        disabled={busy}
        onPress={() => void doExport()}
      />

      <Text variant="label" tone="muted" accessibilityRole="header">
        {t.settings.account}
      </Text>
      {error ? (
        <Text
          tone="bad"
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          {error}
        </Text>
      ) : null}
      <Button
        testID="settings-sign-out"
        label={t.settings.signOut}
        variant="ghost"
        disabled={busy}
        onPress={() => void signOut()}
      />
      <Button
        testID="settings-delete-account"
        label={t.settings.deleteAccount}
        variant="danger"
        disabled={busy}
        onPress={() => void deleteAccount()}
      />

      <Modal
        visible={profileOpen}
        animationType="slide"
        onRequestClose={() => setProfileOpen(false)}
        accessibilityViewIsModal
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <ScrollView
            contentContainerStyle={{ padding: 16, gap: 12 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text variant="title" accessibilityRole="header">
              {t.settings.editProfile}
            </Text>
            {profile ? (
              <OnboardingForm
                initial={{
                  currency: profile.home_currency,
                  openingBalance: minorToDecimalString(
                    profile.opening_balance_minor ?? 0,
                    profile.home_currency,
                  ),
                  monthlyIncome: profile.monthly_income_minor
                    ? minorToDecimalString(
                        profile.monthly_income_minor,
                        profile.home_currency,
                      )
                    : "",
                }}
                submitLabel={t.common.save}
                allowSkip={false}
                onDone={() => setProfileOpen(false)}
              />
            ) : null}
            <Button
              testID="settings-profile-close"
              label={t.settings.close}
              variant="ghost"
              onPress={() => setProfileOpen(false)}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}

function Row({
  label,
  value,
  onPress,
  testID,
  last,
}: {
  label: string;
  value: ReactNode;
  onPress?: () => void;
  testID?: string;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const style = {
    minHeight: 56,
    paddingHorizontal: 16,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
    borderBottomWidth: last ? 0 : 1,
    borderBottomColor: colors.line,
  };
  const body = (
    <>
      <Text>{typeof value === "string" ? `${label} ` : label}</Text>
      <Text tone="muted">{value}</Text>
    </>
  );
  if (!onPress) {
    return (
      <View testID={testID} accessible style={style}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={labelInName([
        label,
        typeof value === "string" ? value : "",
      ])}
      onPress={onPress}
      style={style}
    >
      {body}
    </Pressable>
  );
}

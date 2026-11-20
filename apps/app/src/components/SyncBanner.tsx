import {
  onlineManager,
  useMutationState,
  useQueryClient,
} from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Text } from "@/components/ui/Text";
import { apiErrorKey } from "@/features/transactions/errorKey";
import { t } from "@/i18n/strings";
import { isRetryable, isUnauthorized } from "@/lib/query/errors";

const useOnline = () =>
  useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
  );

export function SyncBanner() {
  const client = useQueryClient();
  const online = useOnline();
  const waiting = useMutationState({
    filters: { mutationKey: ["transactions"], status: "pending" },
  }).length;
  const failed = useMutationState({
    filters: { mutationKey: ["transactions"], status: "error" },
    select: (m) => m,
  });
  if (!waiting && !failed.length && online) return null;
  // A 401 keeps the write: it can be retried once the session is valid again (never auto-discarded).
  const needsSignIn = failed.some((m) => isUnauthorized(m.state.error));
  const retryable = failed.filter(
    (m) => isRetryable(m.state.error) || isUnauthorized(m.state.error),
  );
  // Specific reasons for the failures the server explained (for example an archived category).
  const reasons = [
    ...new Set(
      failed
        .map((m) => apiErrorKey(m.state.error))
        .filter((k) => k !== "generic")
        .map((k) => t.errors[k]),
    ),
  ];

  // Replay in submission order, one at a time, so a create is never overtaken by its later edit or undo.
  async function retryAll() {
    const ordered = [...retryable].sort(
      (x, y) => x.state.submittedAt - y.state.submittedAt,
    );
    for (const m of ordered) {
      try {
        await m.execute(m.state.variables);
      } catch {
        // stays errored; the banner keeps offering Retry/Discard
      }
    }
  }
  function discardAll() {
    failed.forEach((m) => {
      client.getMutationCache().remove(m);
      m.destroy();
    });
    void client.invalidateQueries({ queryKey: ["transactions"] });
    void client.invalidateQueries({ queryKey: ["summary"] });
  }

  return (
    <Card
      testID="sync-banner"
      accessibilityLiveRegion="polite"
      style={{ gap: 8 }}
    >
      {!online ? (
        <Text variant="caption" tone="muted">
          {t.common.offline}
        </Text>
      ) : null}
      {waiting ? (
        <Text variant="caption" tone="muted">
          {t.sync.waiting(waiting)}
        </Text>
      ) : null}
      {failed.length ? (
        <View style={{ gap: 8 }}>
          <Text variant="caption" tone="bad">
            {t.sync.failed(failed.length)}
          </Text>
          {needsSignIn ? (
            <Text variant="caption" tone="bad">
              {t.sync.signInAgain}
            </Text>
          ) : null}
          {reasons.map((reason) => (
            <Text key={reason} variant="caption" tone="bad">
              {reason}
            </Text>
          ))}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {retryable.length ? (
              <Button
                label={t.common.retry}
                variant="ghost"
                onPress={() => void retryAll()}
              />
            ) : null}
            <Button
              label={t.common.discard}
              variant="ghost"
              onPress={discardAll}
            />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

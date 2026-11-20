import { minorToDecimalString } from "@nextcent/shared";
import { useMutationState, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { SyncBanner } from "@/components/SyncBanner";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useMe } from "@/features/me/hooks";
import { t } from "@/i18n/strings";
import { apiErrorKey } from "./errorKey";
import { useTransaction } from "./hooks";
import {
  TX_PUT_KEY,
  useDeleteTransaction,
  usePutTransaction,
  useRestoreTransaction,
} from "./mutations";
import type { PutVars } from "./optimistic";
import {
  usePendingDeletes,
  usePendingPuts,
  usePendingRestores,
} from "./pending";
import { TransactionForm } from "./TransactionForm";

export function EditTransactionScreen({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const client = useQueryClient();
  const me = useMe();
  const tx = useTransaction(id);
  const put = usePutTransaction();
  const del = useDeleteTransaction();
  const restore = useRestoreTransaction();
  const pendingPuts = usePendingPuts();
  const pendingDeletes = usePendingDeletes();
  const pendingRestores = usePendingRestores();
  const failedPuts = useMutationState({
    filters: { mutationKey: TX_PUT_KEY, status: "error" },
    select: (m) => ({ mutation: m, vars: m.state.variables as PutVars }),
  });

  if (!tx.data) {
    return (
      <Screen>
        <SyncBanner />
        {tx.isError ? (
          <>
            <Text tone="bad" accessibilityRole="alert">
              {t.form.notFound}
            </Text>
            <Button label={t.common.retry} onPress={() => void tx.refetch()} />
          </>
        ) : (
          <Text tone="muted">{t.common.loading}</Text>
        )}
        <Button
          label={t.form.back}
          variant="ghost"
          onPress={() => router.back()}
        />
      </Screen>
    );
  }

  const data = tx.data;
  // Only expense and income rows are editable here (the opening balance is managed through settings).
  if (data.kind !== "expense" && data.kind !== "income") {
    return (
      <Screen>
        <SyncBanner />
        <Text tone="bad" accessibilityRole="alert">
          {t.form.notFound}
        </Text>
        <Button
          label={t.form.back}
          variant="ghost"
          onPress={() => router.back()}
        />
      </Screen>
    );
  }
  if (data.deleted_at) {
    return (
      <Screen>
        <SyncBanner />
        <Text variant="title" accessibilityRole="header">
          {t.form.deletedTitle}
        </Text>
        <Button
          testID="transaction-restore"
          label={t.form.restore}
          onPress={() => restore.mutate(id)}
        />
        <Button
          label={t.form.back}
          variant="ghost"
          onPress={() => router.back()}
        />
      </Screen>
    );
  }
  if (!me.data) {
    return (
      <Screen>
        {me.isError ? (
          <>
            <Text tone="bad" accessibilityRole="alert">
              {t.common.loadError}
            </Text>
            <Button label={t.common.retry} onPress={() => void me.refetch()} />
          </>
        ) : (
          <Text tone="muted">{t.common.loading}</Text>
        )}
        <Button
          label={t.form.back}
          variant="ghost"
          onPress={() => router.back()}
        />
      </Screen>
    );
  }

  const conflicts = failedPuts.filter(
    (f) =>
      f.vars.id === id &&
      !f.vars.rebase && // a rebased edit replays on the latest version, so a conflict is not "another device"
      apiErrorKey(f.mutation.state.error) === "version_conflict",
  );
  // Shown once the refetch after the failed save has finished, so the form already holds the server's version.
  const showConflict = conflicts.length > 0 && !tx.isFetching;
  // A change to this row is still queued: its server version is not known yet. The edit is then sent
  // with `rebase` (the replay reads the latest version) instead of a version that would be stale.
  // Deletes and restores bump the server version too, so they count as well.
  const inFlight =
    pendingPuts.some((v) => v.id === id) ||
    pendingDeletes.has(id) ||
    pendingRestores.has(id);
  const kind = data.kind;

  return (
    <Screen>
      <SyncBanner />
      {showConflict ? (
        <Text
          testID="conflict-message"
          tone="bad"
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          {t.errors.version_conflict}
        </Text>
      ) : null}
      <TransactionForm
        // Remount only on a new server version (not on our own optimistic updates, which keep the version).
        key={`${data.id}:${data.version}`}
        mode="edit"
        homeCurrency={data.currency}
        baseVersion={inFlight ? undefined : data.version}
        initial={{
          kind,
          amount: minorToDecimalString(data.amount_minor, data.currency),
          currency: data.currency,
          occurredOn: data.occurred_on,
          categoryId: data.category_id,
          merchant: data.merchant ?? "",
          note: data.note ?? "",
          tags: data.tags,
        }}
        onCancel={() => router.back()}
        onSubmit={(body) => {
          // The new save replaces the rejected one the user was asked to review.
          for (const c of conflicts) {
            client.getMutationCache().remove(c.mutation);
            c.mutation.destroy();
          }
          put.mutate(inFlight ? { id, body, rebase: true } : { id, body });
          router.back();
        }}
        onDelete={() => {
          del.mutate(id);
          router.back();
          toast.show({
            message: t.form.deleted,
            actionLabel: t.common.undo,
            onAction: () => restore.mutate(id),
          });
        }}
      />
    </Screen>
  );
}

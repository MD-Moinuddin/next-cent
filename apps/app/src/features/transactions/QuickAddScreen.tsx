import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useMe } from "@/features/me/hooks";
import { t } from "@/i18n/strings";
import {
  newTransactionId,
  useDeleteTransaction,
  usePutTransaction,
} from "./mutations";
import { TransactionForm } from "./TransactionForm";

export function QuickAddScreen() {
  const router = useRouter();
  const toast = useToast();
  const me = useMe();
  const put = usePutTransaction();
  const del = useDeleteTransaction();
  // One id per screen mount: a repeated tap is the same idempotent PUT, never a second transaction.
  const [id] = useState(newTransactionId);
  const submitted = useRef(false);

  if (!me.data) {
    return (
      <Screen>
        {me.isError ? (
          <>
            <Text tone="bad" accessibilityRole="alert">
              {t.common.loadError}
            </Text>
            <Button label={t.common.retry} onPress={() => void me.refetch()} />
            <Button
              label={t.common.cancel}
              variant="ghost"
              onPress={() => router.back()}
            />
          </>
        ) : (
          <Text tone="muted">{t.common.loading}</Text>
        )}
      </Screen>
    );
  }
  return (
    <Screen>
      <TransactionForm
        mode="create"
        homeCurrency={me.data.home_currency}
        onCancel={() => router.back()}
        onSubmit={(body) => {
          if (submitted.current) return;
          submitted.current = true;
          put.mutate({ id, body });
          router.back();
          toast.show({
            message:
              body.kind === "income" ? t.form.incomeSaved : t.form.expenseSaved,
            actionLabel: t.common.undo,
            // Queued after the create on the shared scope, so it never overtakes it.
            onAction: () => del.mutate(id),
          });
        }}
      />
    </Screen>
  );
}

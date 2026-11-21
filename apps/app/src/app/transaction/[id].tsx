import { useLocalSearchParams } from "expo-router";
import { EditTransactionScreen } from "@/features/transactions/EditTransactionScreen";
import { RequireIdentity } from "@/lib/auth/RequireIdentity";

export default function EditTransaction() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireIdentity>
      <EditTransactionScreen id={String(id)} />
    </RequireIdentity>
  );
}

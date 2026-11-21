import { QuickAddScreen } from "@/features/transactions/QuickAddScreen";
import { RequireIdentity } from "@/lib/auth/RequireIdentity";

export default function QuickAdd() {
  return (
    <RequireIdentity>
      <QuickAddScreen />
    </RequireIdentity>
  );
}

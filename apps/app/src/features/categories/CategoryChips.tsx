import { useState } from "react";
import { View } from "react-native";
import { Chip } from "@/components/ui/Chip";
import { t } from "@/i18n/strings";
import { slug } from "@/lib/slug";
import type { CategoryOut } from "@/lib/types";

const VISIBLE = 5;

/** Wrapping category chips: the first five (and the selected one), the rest behind "More". */
export function CategoryChips({
  categories,
  selectedId,
  onSelect,
}: {
  /** Already ordered, see `orderByUsage`. */
  categories: CategoryOut[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const head = categories.slice(0, VISIBLE);
  const selected = categories.find((c) => c.id === selectedId);
  const shown = expanded
    ? categories
    : selected && !head.includes(selected)
      ? [...head, selected]
      : head;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {shown.map((c) => (
        <Chip
          key={c.id}
          testID={`category-chip-${slug(c.name)}`}
          label={`${c.icon} ${c.name}`}
          selected={c.id === selectedId}
          onPress={() => onSelect(c.id)}
        />
      ))}
      {categories.length > VISIBLE ? (
        <Chip
          testID="category-chip-more"
          label={expanded ? t.form.less : `＋ ${t.form.more}`}
          onPress={() => setExpanded((v) => !v)}
        />
      ) : null}
    </View>
  );
}

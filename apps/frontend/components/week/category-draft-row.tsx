import X from "lucide-react-native/icons/x";
import { View } from "react-native";
import { useTheme } from "../../theme";
import { Divider, Field, IconButton, ListItemIn, Text } from "../ui";
import { ColorPicker } from "./color-picker";
import type { Draft } from "./use-category-drafts";

interface Props {
  draft: Draft;
  index: number;
  taken: string[];
  onChange: (patch: Partial<Draft>) => void;
  onRemove: () => void;
}

/** One editable row in the Week screen's category plan: color swatch, name, hours, remove. */
export function CategoryDraftRow({ draft, index, taken, onChange, onRemove }: Props) {
  const { colors, spacing } = useTheme();

  return (
    <ListItemIn index={index}>
      {index > 0 ? <Divider /> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm }}>
        <ColorPicker color={draft.color} taken={taken} onChange={(color) => onChange({ color })} />
        <Field
          variant="inline"
          value={draft.name}
          onChangeText={(name) => onChange({ name })}
          placeholder="Category name"
          autoCapitalize="sentences"
          style={{ flex: 1 }}
        />
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Field
            variant="inline"
            mono
            align="right"
            keyboardType="decimal-pad"
            accessibilityLabel={`${draft.name || "New category"} hours`}
            value={String(draft.hours)}
            onChangeText={(value) => {
              const hours = Number(value);
              if (!Number.isNaN(hours)) onChange({ hours });
            }}
            style={{ width: 44 }}
          />
          <Text role="data" tone="faint">
            h
          </Text>
        </View>
        <IconButton label={`Remove ${draft.name || "category"}`} tone="plain" onPress={onRemove}>
          <X size={15} color={colors.textFaint} />
        </IconButton>
      </View>
    </ListItemIn>
  );
}

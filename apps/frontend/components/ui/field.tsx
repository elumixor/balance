import { useState } from "react";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import { TextInput, View } from "react-native";
import { useTheme } from "../../theme";
import { Text } from "./text";

interface FieldProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "numeric" | "decimal-pad";
  autoCapitalize?: "none" | "sentences" | "words";
  /** "inline" blends into a row and only shows a rule while focused. */
  variant?: "boxed" | "inline";
  mono?: boolean;
  align?: "left" | "center" | "right";
  /** Screen-reader name for fields whose meaning comes from a nearby row label. */
  accessibilityLabel?: string;
  style?: StyleProp<TextStyle>;
}

export function Field({
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  variant = "boxed",
  mono,
  align = "left",
  accessibilityLabel,
  style,
}: FieldProps) {
  const { colors, spacing, radii, type } = useTheme();
  const [focused, setFocused] = useState(false);
  const base = mono ? type.data : type.body;

  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      placeholderTextColor={colors.textFaint}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize ?? "none"}
      accessibilityLabel={accessibilityLabel}
      style={[
        base,
        {
          color: colors.text,
          textAlign: align,
          paddingVertical: spacing.sm + 2,
          paddingHorizontal: variant === "boxed" ? spacing.md : spacing.xs,
          borderRadius: radii.md,
          backgroundColor: variant === "boxed" ? colors.surfaceAlt : "transparent",
          borderWidth: 1,
          borderColor: focused ? colors.lineStrong : "transparent",
        },
        style,
      ]}
    />
  );
}

export function LabelledField({
  label,
  hint,
  children,
  style,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text role="label" tone="muted">
        {label}
      </Text>
      {children}
      {hint ? (
        <Text role="micro" tone="faint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

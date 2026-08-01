import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useTheme } from "../../theme";
import { BrandMark } from "../brand-mark";
import { GUTTER } from "../ui/layout";
import { Text } from "../ui/text";

export function AuthShell({ tagline, children }: { tagline: string; children: ReactNode }) {
  const { colors, spacing } = useTheme();
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingHorizontal: GUTTER,
          paddingVertical: spacing.xxl,
          gap: spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: spacing.lg }}>
          <BrandMark />
          <View style={{ gap: spacing.xs }}>
            <Text role="title">Balance</Text>
            <Text role="body" tone="muted">
              {tagline}
            </Text>
          </View>
        </View>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

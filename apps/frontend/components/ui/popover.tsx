import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { Dimensions, Modal, Pressable, View } from "react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { useTheme } from "../../theme";

type Anchor = { x: number; y: number; width: number; height: number };

/**
 * An anchored panel for inline choices (theme, colour, account). Replaces the
 * dialogs the app used to open for one-tap decisions.
 */
export function Popover({
  render,
  content,
  width = 220,
  align = "end",
}: {
  render: (open: () => void, isOpen: boolean) => ReactNode;
  content: (close: () => void) => ReactNode;
  width?: number;
  align?: "start" | "end";
}) {
  const { colors, radii, spacing, reduceMotion } = useTheme();
  const anchorRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  function open() {
    anchorRef.current?.measureInWindow((x, y, w, h) => setAnchor({ x, y, width: w, height: h }));
  }

  const screen = Dimensions.get("window");
  const left = anchor
    ? Math.min(
        Math.max(spacing.md, align === "end" ? anchor.x + anchor.width - width : anchor.x),
        screen.width - width - spacing.md,
      )
    : 0;
  const top = anchor ? Math.min(anchor.y + anchor.height + 8, screen.height - 80) : 0;

  const Container = reduceMotion ? View : Animated.View;

  return (
    <>
      <View ref={anchorRef} collapsable={false}>
        {render(open, anchor !== null)}
      </View>
      <Modal visible={anchor !== null} transparent animationType="none" onRequestClose={() => setAnchor(null)}>
        <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={() => setAnchor(null)}>
          <Container
            entering={reduceMotion ? undefined : FadeInUp.duration(160)}
            style={{
              position: "absolute",
              left,
              top,
              width,
              backgroundColor: colors.surface,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: colors.line,
              paddingVertical: spacing.xs,
              overflow: "hidden",
            }}
          >
            {content(() => setAnchor(null))}
          </Container>
        </Pressable>
      </Modal>
    </>
  );
}

export function PopoverItem({
  label,
  onPress,
  selected,
  tone = "default",
  icon,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  tone?: "default" | "danger";
  icon?: ReactNode;
}) {
  const { colors, spacing, type } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        paddingVertical: spacing.sm + 2,
        paddingHorizontal: spacing.md,
        backgroundColor: pressed ? colors.surfaceAlt : "transparent",
      })}
    >
      {icon}
      <Animated.Text
        entering={FadeIn}
        style={[
          type.body,
          { flex: 1, color: tone === "danger" ? colors.danger : colors.text },
        ]}
      >
        {label}
      </Animated.Text>
      {selected ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.ink }} /> : null}
    </Pressable>
  );
}

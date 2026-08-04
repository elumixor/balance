import type { StyleProp, TextProps, TextStyle } from "react-native";
import { Text as RNText } from "react-native";
import { useTheme } from "../../theme";
import type { TypeRole } from "../../theme/typography";

type TextTone = "default" | "muted" | "faint" | "danger" | "positive" | "caution" | "inverse";

interface Props extends Omit<TextProps, "role" | "style"> {
  role?: TypeRole;
  tone?: TextTone;
  /** Overrides the tone — used for category-coloured text. */
  color?: string;
  style?: StyleProp<TextStyle>;
}

export function Text({ role = "body", tone = "default", color, style, ...rest }: Props) {
  const { colors, type } = useTheme();
  const toneColor = {
    default: colors.text,
    muted: colors.textMuted,
    faint: colors.textFaint,
    danger: colors.danger,
    positive: colors.positive,
    caution: colors.caution,
    inverse: colors.inkText,
  }[tone];

  return <RNText {...rest} style={[type[role], { color: color ?? toneColor }, style]} />;
}

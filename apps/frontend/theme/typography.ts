import type { TextStyle } from "react-native";

export const fonts = {
  display: "BricolageGrotesque_700Bold",
  displayMedium: "BricolageGrotesque_600SemiBold",
  sans: "InstrumentSans_400Regular",
  sansMedium: "InstrumentSans_500Medium",
  sansBold: "InstrumentSans_600SemiBold",
  mono: "DMMono_400Regular",
  monoMedium: "DMMono_500Medium",
} as const;

/**
 * Prose speaks in Instrument Sans, quantities in DM Mono. Anything that is a
 * duration, an hour count or a percentage is a readout and gets the mono face.
 */
export const type = {
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.8 },
  heading: { fontFamily: fonts.displayMedium, fontSize: 19, lineHeight: 24, letterSpacing: -0.3 },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: fonts.sansBold, fontSize: 15, lineHeight: 21 },
  label: { fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 18 },
  micro: { fontFamily: fonts.sansMedium, fontSize: 11, lineHeight: 15, letterSpacing: 0.2 },
  readout: {
    fontFamily: fonts.monoMedium,
    fontSize: 44,
    lineHeight: 50,
    letterSpacing: -1.5,
    fontVariant: ["tabular-nums"],
  },
  data: { fontFamily: fonts.mono, fontSize: 14, lineHeight: 19, fontVariant: ["tabular-nums"] },
  dataStrong: { fontFamily: fonts.monoMedium, fontSize: 18, lineHeight: 23, fontVariant: ["tabular-nums"] },
  dataMicro: { fontFamily: fonts.mono, fontSize: 11, lineHeight: 15, fontVariant: ["tabular-nums"] },
} satisfies Record<string, TextStyle>;

export type TypeRole = keyof typeof type;

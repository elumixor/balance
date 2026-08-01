import { View } from "react-native";
import Svg from "react-native-svg";
import { swatchPalette } from "../theme/colors";
import { Arc } from "./ring/arc";

/** The product's own artefact: a week, already divided. */
const SHARES = [0.34, 0.22, 0.16, 0.28];

export function BrandMark({ size = 44 }: { size?: number }) {
  const thickness = size * 0.2;
  const r = size / 2 - thickness / 2;
  let cursor = 0;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {SHARES.map((share, i) => {
          const start = cursor;
          cursor += share;
          return (
            <Arc
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              thickness={thickness}
              color={swatchPalette[i * 2 + 1]}
              start={start + 0.008}
              sweep={share - 0.016}
              delay={i * 90}
            />
          );
        })}
      </Svg>
    </View>
  );
}

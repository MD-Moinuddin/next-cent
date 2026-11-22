import Svg, { Circle, G } from "react-native-svg";
import { View } from "react-native";
import { Text } from "@/components/ui/Text";

export type DonutSegment = { id: string; value: number; color: string };

const SIZE = 132;
const STROKE = 22;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
const GAP = 2;

/** Dash length and offset for each segment, as a fraction of the circle; empty for a zero total. */
export function donutArcs(
  values: number[],
): { length: number; offset: number }[] {
  const total = values.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return [];
  let offset = 0;
  return values.map((v) => {
    const share = (Math.max(0, v) / total) * C;
    const arc = {
      length: Math.max(0, share - (values.length > 1 ? GAP : 0)),
      offset,
    };
    offset += share;
    return arc;
  });
}

export function DonutChart({
  segments,
  centerLabel,
  centerValue,
  track,
  textColor,
  mutedColor,
}: {
  segments: DonutSegment[];
  centerLabel: string;
  centerValue: string;
  track: string;
  textColor: string;
  mutedColor: string;
}) {
  const arcs = donutArcs(segments.map((s) => s.value));
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: SIZE, height: SIZE }}
    >
      <Svg width={SIZE} height={SIZE}>
        <G rotation={-90} origin={`${SIZE / 2}, ${SIZE / 2}`}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke={track}
            strokeWidth={STROKE}
            fill="none"
          />
          {arcs.map((a, i) => (
            <Circle
              key={segments[i]!.id}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              stroke={segments[i]!.color}
              strokeWidth={STROKE}
              fill="none"
              strokeDasharray={`${a.length} ${C - a.length}`}
              strokeDashoffset={-a.offset}
            />
          ))}
        </G>
      </Svg>
      <View
        style={{
          position: "absolute",
          inset: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text variant="caption" style={{ color: mutedColor, fontSize: 11 }}>
          {centerLabel}
        </Text>
        <Text variant="label" style={{ color: textColor, fontSize: 17 }}>
          {centerValue}
        </Text>
      </View>
    </View>
  );
}

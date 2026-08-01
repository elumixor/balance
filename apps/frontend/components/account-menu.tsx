import { useClerk, useUser } from "@clerk/clerk-expo";
import { LogOut, Monitor, Moon, Sun } from "lucide-react-native";
import { View } from "react-native";
import { useTheme, type ThemeMode } from "../theme";
import { Divider } from "./ui/layout";
import { Popover, PopoverItem } from "./ui/popover";
import { Text } from "./ui/text";
import { Touchable } from "./ui/touchable";

const MODES: { value: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "Match device", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

/** One place for the two things that aren't part of the week: appearance and account. */
export function AccountMenu() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { colors, radii, mode, setMode } = useTheme();
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const initial = (email || "?").charAt(0).toUpperCase();

  return (
    <Popover
      width={230}
      render={(open) => (
        <Touchable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel="Account and appearance"
          scaleTo={0.92}
          style={{
            width: 34,
            height: 34,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: colors.lineStrong,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text role="label">{initial}</Text>
        </Touchable>
      )}
      content={(close) => (
        <View>
          {email ? (
            <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 }}>
              <Text role="micro" tone="faint" numberOfLines={1}>
                {email}
              </Text>
            </View>
          ) : null}
          <Divider />
          <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 }}>
            <Text role="micro" tone="muted">
              Appearance
            </Text>
          </View>
          {MODES.map(({ value, label, Icon }) => (
            <PopoverItem
              key={value}
              label={label}
              selected={mode === value}
              icon={<Icon size={15} color={colors.textMuted} />}
              onPress={() => {
                setMode(value);
                close();
              }}
            />
          ))}
          <Divider />
          <PopoverItem
            label="Sign out"
            tone="danger"
            icon={<LogOut size={15} color={colors.danger} />}
            onPress={() => {
              close();
              signOut();
            }}
          />
        </View>
      )}
    />
  );
}

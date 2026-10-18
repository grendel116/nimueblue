import type { ComponentProps } from "react";
import type Ionicons from "@expo/vector-icons/Ionicons";
import { Pill } from "@/components/ui";

// A rounded action button for the artist page. `filled` marks the main action; without
// onPress it shows as a plain label
export default function PillButton({
  icon,
  label,
  detail,
  onPress,
  filled = false,
  loading = false,
  accessibilityLabel,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  detail?: string;
  onPress?: () => void;
  filled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pill
      icon={icon}
      label={label}
      detail={detail}
      onPress={onPress}
      active={filled}
      loading={loading}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

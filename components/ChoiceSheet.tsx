import { StyleSheet, View } from "react-native";
import { Button, ModalShell } from "@/components/ui";
import { showChoice, useChoice } from "@/state/choice";

// The app's own pick-one dialog, matching the web build's: a card with the title, a hint, and
// one full-width button per action. Tapping outside, or Cancel, closes it
export default function ChoiceSheet() {
  const choice = useChoice();
  if (!choice) return null;

  const close = () => showChoice(null);
  const buttons = choice.buttons.some((b) => b.style === "cancel")
    ? choice.buttons
    : [...choice.buttons, { text: "Cancel", style: "cancel" as const }];

  return (
    <ModalShell
      visible={true}
      onClose={close}
      title={choice.title}
      message={choice.message}
    >
      <View style={styles.buttons}>
        {buttons.map((b, i) => {
          const variant =
            b.style === "destructive"
              ? "destructive"
              : b.style === "cancel"
                ? "secondary"
                : "primary";
          return (
            <Button
              key={`${b.text}-${i}`}
              label={b.text}
              variant={variant}
              onPress={() => {
                close();
                b.onPress?.();
              }}
              fullWidth
            />
          );
        })}
      </View>
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  buttons: {
    gap: 8,
    marginTop: 16,
  },
});

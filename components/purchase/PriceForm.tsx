import { useState } from "react";
import { Text } from "react-native";
import { formatMoney } from "@/queries/listener";
import { checkAmount, isEmail, toAmountText, type PriceChip } from "./helpers";
import { AmountField, ErrorText, Field, GuestEmailField, PrimaryButton, styles } from "./ui";

export type PriceFormExtras = { message?: string; guestEmail?: string };

// The paying half of every purchase: an amount (editable unless the price is set), an optional
// note to the artist, the listener's email for receipt & download link, and the pay button
export function PriceForm({
  label,
  currency,
  minimum,
  initial,
  chips,
  editable = true,
  noteTo,
  action,
  busy,
  error,
  onSubmit,
}: {
  label: string;
  currency: string;
  minimum: number;
  initial: number;
  chips?: PriceChip[];
  editable?: boolean;
  // The artist's name; the note field shows when given
  noteTo?: string;
  // The button label, given the formatted price once the amount is valid
  action: (price?: string) => string;
  busy: boolean;
  error?: string;
  onSubmit: (cents: number, extras: PriceFormExtras) => void;
}) {
  const [amount, setAmount] = useState(toAmountText(initial));
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [problem, setProblem] = useState<string>();
  const check = checkAmount(amount, minimum, currency);

  const submit = () => {
    if (check.error !== undefined) {
      setProblem(check.error);
      return;
    }
    if (!isEmail(email)) {
      setProblem("Enter your email so Mirlo can send your receipt");
      return;
    }
    setProblem(undefined);
    onSubmit(check.cents, {
      message: note.trim() || undefined,
      guestEmail: email.trim(),
    });
  };

  return (
    <>
      {editable ? (
        <AmountField
          label={label}
          value={amount}
          onChangeText={setAmount}
          currency={currency}
          minimum={minimum}
          chips={chips}
        />
      ) : null}
      {noteTo ? (
        <Field
          label={`Note to ${noteTo} (optional)`}
          value={note}
          onChangeText={setNote}
          multiline
        />
      ) : null}
      <GuestEmailField value={email} onChangeText={setEmail} />
      <ErrorText message={problem ?? error} />
      <PrimaryButton
        label={action(check.cents !== undefined ? formatMoney(check.cents, currency) : undefined)}
        busy={busy}
        onPress={submit}
      />
      <Text style={styles.hint}>Payment happens on Mirlo's secure checkout page.</Text>
    </>
  );
}

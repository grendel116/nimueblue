import { Text } from "react-native";
import { priceChips } from "./helpers";
import { PriceForm } from "./PriceForm";
import type { CheckoutControls } from "./useCheckout";
import { styles } from "./ui";

type CataloguePurchaseProps = CheckoutControls & {
  artist: Artist;
  currency: string;
  // The artist's price in cents for every release they sell
  price: number;
};

// Buying everything the artist sells, at their catalogue price or more
export function CataloguePurchase({ artist, currency, price, ...checkout }: CataloguePurchaseProps) {
  return (
    <>
      <Text style={styles.title}>Everything by {artist.name}</Text>
      <Text style={styles.body}>
        Every release {artist.name} sells on Mirlo, with downloads, saved to your Library.
      </Text>
      <PriceForm
        label="Price"
        currency={currency}
        minimum={price}
        initial={price}
        chips={priceChips(price)}
        noteTo={artist.name}
        action={(formatted) => (formatted ? `Buy Everything for ${formatted}` : "Buy Everything")}
        busy={checkout.busy}
        error={checkout.error}
        onSubmit={(cents, { message, guestEmail }) =>
          checkout.onPay({
            artistId: artist.id,
            artistSlug: artist.urlSlug || String(artist.id),
            items: [{ type: "catalogue", price: String(cents), message }],
            guestEmail,
          })
        }
      />
    </>
  );
}

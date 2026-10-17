import { useCallback, useState } from "react";
import {
  checkoutCompleteUrl,
  startCheckout,
  type DeferredQuote,
  type PurchaseItem,
} from "@/queries/listener";

export type CheckoutRequest = {
  artistId: number;
  artistSlug: string;
  items: PurchaseItem[];
  guestEmail?: string;
};

// What each view of the sheet needs to start a checkout
export type CheckoutControls = {
  onPay: (request: CheckoutRequest) => void;
  busy: boolean;
  error?: string;
};

// The pay stage shows Mirlo's checkout: in-app Stripe Elements or hosted fallback
export type PayStageProps = {
  checkoutUrl?: string;
  deferred?: DeferredQuote;
  guestEmail?: string;
  onPaid: () => void;
  onCancel: () => void;
};

export type CheckoutOutcome = "recorded" | "emailed" | "processing";

export type CheckoutStage =
  | { name: "choose" }
  | { name: "pay"; checkoutUrl?: string; deferred?: DeferredQuote }
  | { name: "confirming" }
  | { name: "done"; outcome: CheckoutOutcome };

// Runs one purchase through Mirlo's hosted checkout: choose -> pay -> done.
export function useCheckout() {
  const [stage, setStage] = useState<CheckoutStage>({ name: "choose" });
  const [request, setRequest] = useState<CheckoutRequest>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const pay = async (next: CheckoutRequest) => {
    setBusy(true);
    setError(undefined);
    setRequest(next);
    try {
      const { checkoutUrl, deferred } = await startCheckout({
        artistId: next.artistId,
        items: next.items,
        email: next.guestEmail,
        successUrl: checkoutCompleteUrl(next.artistSlug, next.items[0].type),
      });
      if (deferred) {
        setStage({ name: "pay", deferred });
      } else if (checkoutUrl) {
        setStage({ name: "pay", checkoutUrl });
      } else {
        setStage({ name: "done", outcome: "emailed" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the checkout. Try again.");
    } finally {
      setBusy(false);
    }
  };

  // Once the listener has paid, Mirlo emails their receipt and download link
  const confirm = useCallback(() => {
    setStage({ name: "done", outcome: "emailed" });
  }, []);

  const cancel = useCallback(() => setStage({ name: "choose" }), []);

  return { stage, request, busy, error, pay, confirm, cancel };
}

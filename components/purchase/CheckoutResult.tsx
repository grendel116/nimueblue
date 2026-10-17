import type { PurchaseItem } from "@/queries/listener";
import type { CheckoutOutcome } from "./useCheckout";
import { Loading, Notice, PrimaryButton } from "./ui";

export function Confirming() {
  return <Loading label="Confirming your payment with Mirlo…" />;
}

const RECORDED: Record<PurchaseItem["type"], string> = {
  trackGroup: "The album is in your Library now.",
  catalogue: "Every release is in your Library now.",
  subscription: "You're subscribed.",
  tip: "Your tip is on its way.",
};

// The thank-you at the end of a checkout
export function Done({
  outcome,
  purchaseType,
  artistName,
  email,
  onDone,
}: {
  outcome: CheckoutOutcome;
  purchaseType: PurchaseItem["type"];
  artistName: string;
  album?: AlbumProps;
  email?: string;
  onDone: () => void;
}) {
  const sendsDownloads = purchaseType === "trackGroup" || purchaseType === "catalogue";
  const detail = {
    recorded: RECORDED[purchaseType],
    emailed: `Mirlo will email your receipt${sendsDownloads ? " and download link" : ""} to ${email}.`,
    processing: "Mirlo is still processing your payment.",
  }[outcome];

  return (
    <>
      <Notice icon="checkmark-circle" title={`Thank you for supporting ${artistName}!`} body={detail} />
      <PrimaryButton label="Done" onPress={onDone} />
    </>
  );
}

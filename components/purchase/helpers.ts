import { formatMoney, toCents } from "@/queries/listener";

// Pure helpers behind the purchase sheet. Money is integer cents, as in Mirlo's API

// Mirlo's own releases carry source "Mirlo Space" and sell through Mirlo's checkout;
// releases from every other source sell on their own sites
export function sellsOnMirlo(album: Pick<AlbumProps, "source">): boolean {
  return album.source === "Mirlo Space";
}

export function isFreeAlbum(album: Pick<AlbumProps, "minPrice">): boolean {
  return !album.minPrice;
}

// What the album page offers for a Faircamp release: the shop for paid, code and external
// downloads, the download button for free ones, and neither when downloads are off.
// Undefined for releases from other sources
export function faircampAction(album: Pick<AlbumProps, "source" | "faircampShop">): "shop" | "download" | "none" | undefined {
  if (album.source !== "Faircamp") return undefined;
  if (!album.faircampShop) return "none";
  return album.faircampShop.mode === "free" ? "download" : "shop";
}

// The price the sheet starts on, as the website does: the suggestion, else the minimum
export function defaultAlbumPrice(album: Pick<AlbumProps, "minPrice" | "suggestedPrice">): number {
  return album.suggestedPrice ?? album.minPrice ?? 0;
}

export function albumCurrency(album: Pick<AlbumProps, "currency">, artist?: Pick<Artist, "user">): string {
  return album.currency ?? artistCurrency(artist);
}

export function artistCurrency(artist?: Pick<Artist, "user">): string {
  return artist?.user?.currency ?? "usd";
}

// Cents as the text a price field shows, e.g. 450 -> "4.50"
export function toAmountText(cents: number): string {
  return (cents / 100).toFixed(2);
}

export type PriceChip = { label: string; cents: number };

// Quick picks for a pay-what-you-want price: the minimum, the suggestion and double the
// suggestion (or double the minimum). Each amount appears once, under its first label
export function priceChips(minimum: number, suggested?: number | null): PriceChip[] {
  const chips: PriceChip[] = [
    { label: "Minimum", cents: minimum },
    { label: "Suggested", cents: suggested ?? 0 },
    { label: "Double", cents: (suggested || minimum) * 2 },
  ];
  return chips.filter(
    (chip, index) => chip.cents > 0 && chips.findIndex((c) => c.cents === chip.cents) === index,
  );
}

export type AmountCheck = { cents: number; error?: undefined } | { cents?: undefined; error: string };

// Reads a typed amount in major units ("4.50") and holds it to the minimum in cents
export function checkAmount(text: string, minimum: number, currency: string): AmountCheck {
  const cents = toCents(text.trim());
  if (!text.trim() || !(cents > 0)) return { error: "Enter an amount" };
  if (cents < minimum) return { error: `The minimum is ${formatMoney(minimum, currency)}` };
  return { cents };
}

export function isEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());
}

// The artist's paid tiers; the default tier is the free follow
export function paidTiers(artist?: Pick<Artist, "subscriptionTiers">): SubscriptionTier[] {
  return (artist?.subscriptionTiers ?? []).filter((tier) => !tier.isDefaultTier);
}

export function tierAmount(tier: Pick<SubscriptionTier, "defaultAmount" | "minAmount">): number {
  return tier.defaultAmount ?? tier.minAmount ?? 0;
}

export function intervalLabel(interval?: SubscriptionTier["interval"]): string {
  return interval === "YEAR" ? "year" : "month";
}

export function formatPurchaseButtonLabel(
  label?: string,
  fallbackSource = "Mirlo",
): string {
  const sourceName = label?.trim() || fallbackSource;
  const lower = sourceName.toLowerCase();

  // Explicit actions like "Subscribe on Mirlo", "Download release", or "Support on Patreon"
  if (
    lower.startsWith("subscribe") ||
    lower.startsWith("support") ||
    lower.startsWith("download")
  ) {
    if (lower === "downloads" || lower === "download") {
      return "Download Release";
    }
    return sourceName;
  }
  if (lower.includes("subscription")) {
    const provider = sourceName.replace(/subscription/i, "").trim();
    return provider
      ? `Subscribe on ${provider}`
      : `Subscribe on ${fallbackSource}`;
  }

  // Clean up any leading "Buy on" or "Purchase on" to avoid duplicate prefixes
  const cleanSource = sourceName
    .replace(/^(buy|purchase)\s+on\s+/i, "")
    .replace(/^(buy|purchase)\s+/i, "")
    .trim();

  // If the label was generic "Album", "Release", or "Downloads", use fallbackSource
  const isGeneric =
    !cleanSource ||
    cleanSource.toLowerCase() === "album" ||
    cleanSource.toLowerCase() === "release" ||
    cleanSource.toLowerCase() === "downloads";

  // Normalize Mirlo Space / mirlo to "Mirlo"
  const normalizedSource = isGeneric
    ? fallbackSource
    : cleanSource.toLowerCase() === "mirlo space" ||
        cleanSource.toLowerCase() === "mirlo"
      ? "Mirlo"
      : cleanSource;

  return `Purchase on ${normalizedSource}`;
}

export type StoreLink = { label: string; url: string };

// The stores a release from another source lists, labelled for buttons:
// its purchase links, else the page it came from
export function externalPurchaseLinks(
  album: Pick<AlbumProps, "source" | "sourceUrl" | "purchaseLinks">,
): StoreLink[] {
  const source = album.source || "the artist's site";
  if (album.purchaseLinks?.length) {
    return album.purchaseLinks.map((link) => ({
      label: formatPurchaseButtonLabel(link.label, source),
      url: link.url,
    }));
  }
  return album.sourceUrl
    ? [{ label: formatPurchaseButtonLabel(undefined, source), url: album.sourceUrl }]
    : [];
}

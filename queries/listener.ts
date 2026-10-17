import { queryOptions } from "@tanstack/react-query";
import * as api from "./fetch/fetchWrapper";

// Listener queries for artist followers and checkout.

export const MIRLO_WEB = "https://mirlo.space";

export type ArtistRelation = {
  isFollowing: boolean;
  // The paid tier the listener subscribes to, if any
  subscriptionTier?: SubscriptionTier;
};

export function artistRelation(
  user: LoggedInUser | null | undefined,
  artistId: number | undefined,
): ArtistRelation {
  const tiers = (user?.artistUserSubscriptions ?? [])
    .map((s) => s.artistSubscriptionTier)
    .filter((tier) => tier && tier.artistId === artistId);
  return {
    isFollowing: tiers.length > 0,
    subscriptionTier: tiers.find((tier) => !tier.isDefaultTier),
  };
}

export type FollowedArtist = { artist: Artist; tierName?: string };

// Each artist once: subscribers first with their tier name, then free follows
export function followedArtists(user: LoggedInUser | null | undefined): FollowedArtist[] {
  const byArtist = new Map<number, FollowedArtist>();
  (user?.artistUserSubscriptions ?? []).forEach(({ artistSubscriptionTier: tier }) => {
    if (!tier?.artist) return;
    const existing = byArtist.get(tier.artistId);
    if (!tier.isDefaultTier) {
      byArtist.set(tier.artistId, { artist: tier.artist, tierName: tier.name });
    } else if (!existing) {
      byArtist.set(tier.artistId, { artist: tier.artist });
    }
  });
  return Array.from(byArtist.values()).sort(
    (a, b) => Number(Boolean(b.tierName)) - Number(Boolean(a.tierName)),
  );
}

export function queryArtistFollowers(artistId: number | undefined) {
  return queryOptions({
    queryKey: ["fetchArtistFollowers", artistId],
    queryFn: ({ signal }) =>
      api
        .get<{ result: number }>(`/v1/artists/${artistId}/followers`, { signal })
        .then((r) => r.result),
    enabled: Boolean(artistId),
    staleTime: 5 * 60 * 1000,
  });
}

// Price in cents of every release the artist sells, offered when the artist turns it on
export function queryCatalogPrice(artistId: number | undefined, enabled: boolean) {
  return queryOptions({
    queryKey: ["fetchCatalogPrice", artistId],
    queryFn: ({ signal }) =>
      api
        .get<{ result: { price: number } }>(`/v1/artists/${artistId}/purchaseCatalogue`, { signal })
        .then((r) => r.result.price),
    enabled: Boolean(artistId) && enabled,
    staleTime: 5 * 60 * 1000,
  });
}

// True when the account that gets paid for this artist can take card payments
export function queryPaymentsEnabled(artist: Artist | undefined) {
  const payeeId = artist?.paymentToUserId ?? artist?.userId;
  return queryOptions({
    queryKey: ["fetchPaymentsEnabled", payeeId],
    queryFn: ({ signal }) =>
      api
        .get<{ result: { chargesEnabled: boolean } }>(
          `/v1/users/${payeeId}/stripe/checkAccountStatus`,
          { signal },
        )
        .then((r) => Boolean(r?.result?.chargesEnabled))
        .catch(() => false),
    enabled: Boolean(payeeId),
    staleTime: 10 * 60 * 1000,
  });
}

// Money is integer cents everywhere in Mirlo's API
export function toCents(amount: string): number {
  const value = Number(amount.replace(",", "."));
  return Number.isFinite(value) ? Math.round(value * 100) : NaN;
}

export function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export type PurchaseItem =
  | { type: "trackGroup"; id: number; price: string; message?: string }
  | { type: "catalogue"; price: string; message?: string }
  | { type: "tip"; amount: number; message?: string }
  | { type: "subscription"; tierId: number; amount: number };

// Mirlo's checkout page sends the buyer here once they've paid; the app watches for it
export function checkoutCompleteUrl(artistSlug: string, purchaseType: PurchaseItem["type"]) {
  return `${MIRLO_WEB}/${artistSlug}/checkout-complete?purchaseType=${purchaseType}`;
}

export function isCheckoutCompleteUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.origin === MIRLO_WEB && parsed.pathname.endsWith("/checkout-complete");
  } catch {
    return false;
  }
}

export const MIRLO_STRIPE_PUBLISHABLE_KEY =
  "pk_live_51Mqk7sLg9Wvtcfb9V94fKToU4k4uWxyp6N3HqtOPd5xhvb3ubHIRyA2LyFvHVTdmSc5pJ9IL0rG9Kzf3DbrUQiel00QeWKDimZ";

export type DeferredQuote = {
  mode: "payment" | "setup";
  amount: number;
  currency: string;
  stripeAccountId: string;
  requiresShipping: boolean;
  checkoutId: string;
  buyerEmailKnown: boolean;
  artistName: string;
  successUrl?: string | null;
};

// Opens a checkout on Mirlo. Requests an in-app deferred Stripe quote;
// falls back to hosted URL if deferred is not supported for this purchase.
export async function startCheckout(body: {
  artistId: number;
  items: PurchaseItem[];
  email?: string;
  successUrl: string;
}): Promise<{ checkoutUrl?: string; deferred?: DeferredQuote }> {
  const res = await api.post<
    object,
    { redirectUrl?: string; deferred?: DeferredQuote }
  >("/v1/purchase", {
    ...body,
    deferred: true,
  });
  if (res.deferred) {
    return { deferred: res.deferred };
  }
  return { checkoutUrl: res.redirectUrl?.startsWith("http") ? res.redirectUrl : undefined };
}

// Confirms purchase intent and retrieves the Stripe clientSecret for PaymentElement
export async function confirmPurchaseIntent(body: {
  checkoutId: string;
  amount: number;
  email?: string;
  shippingAddress?: unknown;
}): Promise<{ clientSecret: string; stripeAccountId: string; paymentIntentId: string }> {
  return api.post("/v1/purchase", body);
}

import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@/constants/theme";
import { formatMoney } from "@/queries/listener";
import { defaultAlbumPrice, intervalLabel, paidTiers, tierAmount } from "./helpers";
import { PriceForm } from "./PriceForm";
import type { CheckoutControls } from "./useCheckout";
import { styles as ui } from "./ui";

const DEFAULT_TIP = 500;
const COLLAPSED_DESC_LENGTH = 140;

type SupportPurchaseProps = CheckoutControls & {
  artist: Artist;
  currency: string;
  album?: AlbumProps;
  onBuyAlbum?: () => void;
};

// Supporting an artist: a one-time tip, one of their recurring membership tiers, or buying
// the release currently playing
export function SupportPurchase({
  artist,
  currency,
  album,
  onBuyAlbum,
  ...checkout
}: SupportPurchaseProps) {
  const tiers = paidTiers(artist);
  // Default to "One-time tip" so supporting from anywhere starts on a simple, clear action
  const [choice, setChoice] = useState<number | "tip">("tip");
  const tier = tiers.find((t) => t.id === choice);
  const artistSlug = artist.urlSlug || String(artist.id);
  const albumCover = album?.cover?.sizes?.[120] || album?.cover?.sizes?.[300];
  const albumPrice = album ? defaultAlbumPrice(album) : 0;

  return (
    <>
      <Text style={ui.title}>Support {artist.name}</Text>

      {album && onBuyAlbum ? (
        <Pressable
          onPress={onBuyAlbum}
          style={styles.albumBanner}
          accessibilityRole="button"
          accessibilityLabel={`Buy ${album.title}`}
        >
          {albumCover ? <Image source={{ uri: albumCover }} style={styles.albumThumb} /> : null}
          <View style={styles.albumBannerText}>
            <Text style={styles.albumBannerTitle} numberOfLines={1}>
              Buy "{album.title}"
            </Text>
            <Text style={styles.albumBannerSub} numberOfLines={1}>
              {albumPrice > 0
                ? `From ${formatMoney(albumPrice, album.currency ?? currency)} · digital download`
                : "Digital release"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.primary} />
        </Pressable>
      ) : null}

      <View style={styles.options}>
        <Option
          selected={choice === "tip"}
          onPress={() => setChoice("tip")}
          title="One-time tip"
          description={`Send ${artist.name} any amount, once.`}
        />

        {tiers.length > 0 ? (
          <Text style={styles.sectionLabel}>RECURRING MEMBERSHIP TIERS</Text>
        ) : null}

        {tiers.map((t) => (
          <Option
            key={t.id}
            selected={choice === t.id}
            onPress={() => setChoice(t.id)}
            title={t.name}
            price={`${formatMoney(tierAmount(t), currency)} / ${intervalLabel(t.interval)}`}
            description={t.description}
          />
        ))}
      </View>

      {tier ? (
        <PriceForm
          key={tier.id}
          label={`Amount per ${intervalLabel(tier.interval)}`}
          currency={currency}
          minimum={tier.minAmount ?? 0}
          initial={tierAmount(tier)}
          editable={Boolean(tier.allowVariable)}
          action={(price) =>
            price ? `Subscribe for ${price} / ${intervalLabel(tier.interval)}` : "Subscribe"
          }
          busy={checkout.busy}
          error={checkout.error}
          onSubmit={(cents, { guestEmail }) =>
            checkout.onPay({
              artistId: artist.id,
              artistSlug,
              items: [{ type: "subscription", tierId: tier.id, amount: cents }],
              guestEmail,
            })
          }
        />
      ) : (
        <PriceForm
          key="tip"
          label="Tip"
          currency={currency}
          minimum={0}
          initial={DEFAULT_TIP}
          noteTo={artist.name}
          action={(price) => (price ? `Send ${price}` : "Send tip")}
          busy={checkout.busy}
          error={checkout.error}
          onSubmit={(cents, { message, guestEmail }) =>
            checkout.onPay({
              artistId: artist.id,
              artistSlug,
              items: [{ type: "tip", amount: cents, message }],
              guestEmail,
            })
          }
        />
      )}
    </>
  );
}

function Option({
  selected,
  onPress,
  title,
  price,
  description,
  badge,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  price?: string;
  description?: string;
  badge?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const cleanDesc = description?.trim();
  const isLong = Boolean(
    cleanDesc && (cleanDesc.length > COLLAPSED_DESC_LENGTH || cleanDesc.includes("\n")),
  );

  return (
    <Pressable
      onPress={onPress}
      style={[styles.option, selected && styles.optionSelected]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={[title, price, badge].filter(Boolean).join(", ")}
    >
      <Ionicons
        name={selected ? "radio-button-on" : "radio-button-off"}
        size={20}
        color={selected ? theme.colors.primary : theme.colors.textMuted}
      />
      <View style={styles.optionText}>
        <View style={styles.optionHeading}>
          <Text style={ui.sectionTitle}>{title}</Text>
          {badge ? <Text style={styles.badge}>{badge}</Text> : null}
        </View>
        {price ? <Text style={styles.price}>{price}</Text> : null}
        {cleanDesc ? (
          <>
            <Text style={styles.description} numberOfLines={expanded ? undefined : 2}>
              {cleanDesc}
            </Text>
            {isLong ? (
              <Pressable
                onPress={() => {
                  onPress();
                  setExpanded((prev) => !prev);
                }}
                hitSlop={6}
              >
                <Text style={styles.moreToggle}>
                  {expanded ? "Show less" : "Read tier details"}
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  albumBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.surfaceGlassBorder,
    backgroundColor: theme.colors.surface,
  },
  albumThumb: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceElevated,
  },
  albumBannerText: {
    flex: 1,
    gap: 2,
  },
  albumBannerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  albumBannerSub: {
    fontSize: 12,
    color: theme.colors.textCyan,
    fontWeight: "600",
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: theme.colors.textMuted,
    marginTop: 6,
    marginBottom: 2,
  },
  options: {
    gap: 10,
  },
  option: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
    backgroundColor: theme.colors.surface,
  },
  optionSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: "rgba(0, 210, 255, 0.08)",
  },
  optionText: {
    flex: 1,
    gap: 4,
  },
  optionHeading: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  badge: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.playButtonIcon,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: "hidden",
  },
  price: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textCyan,
  },
  description: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  moreToggle: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.primary,
    marginTop: 2,
  },
});

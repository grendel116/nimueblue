import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import FollowArtistButton from "@/components/FollowArtistButton";
import PillButton from "@/components/artist/PillButton";
import { openInBrowser } from "@/scripts/openInBrowser";
import { artistShareUrl, shareMessage } from "@/scripts/share";

// Follow, Support and Share, the same for an artist on any host. Support opens the artist's
// support page on their host
export default function ArtistActions({ artist }: { artist: Artist }) {
  const [copied, setCopied] = useState(false);
  const slug = artist.urlSlug || String(artist.id);
  const supportUrl = artist.supportUrl;

  const share = async () => {
    const wasCopied = await shareMessage(artistShareUrl(slug), artist.name);
    if (wasCopied) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <View style={styles.row}>
      <FollowArtistButton artist={artist} />
      {supportUrl ? (
        <PillButton
          icon="cash-outline"
          label="Support"
          onPress={() => openInBrowser(supportUrl)}
          accessibilityLabel={`Support ${artist.name}`}
        />
      ) : null}
      <PillButton
        icon={copied ? "checkmark" : "share-social-outline"}
        label={copied ? "Link copied" : "Share"}
        onPress={share}
        accessibilityLabel={`Share ${artist.name}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
});

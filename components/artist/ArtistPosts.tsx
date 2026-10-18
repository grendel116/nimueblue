import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import Markdown from "react-native-markdown-display";
import { theme } from "@/constants/theme";
import { htmlToMarkdown } from "@/scripts/utils";
import { openInBrowser } from "@/scripts/openInBrowser";
import { openPurchase } from "@/scripts/openPurchase";
import { MIRLO_WEB } from "@/queries/listener";

const LATEST_COUNT = 3;

const markdownStyle = {
  body: { color: theme.colors.textSecondary, fontSize: 14, lineHeight: 22 },
  link: { color: theme.colors.textCyan },
};

const openLink = (url: string) => {
  openInBrowser(url);
  return false;
};

// The artist's newest posts. Each shows a short excerpt and opens in place to the full post;
// subscriber-only posts offer Support
export default function ArtistPosts({ artist, routeId }: { artist: Artist; routeId: string }) {
  const [openId, setOpenId] = useState<number>();
  const posts = [...(artist.posts ?? [])]
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, LATEST_COUNT);
  if (posts.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.header}>Latest Posts</Text>
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          artist={artist}
          routeId={routeId}
          open={openId === post.id}
          onToggle={() => setOpenId(openId === post.id ? undefined : post.id)}
        />
      ))}
      {(artist.posts?.length ?? 0) > LATEST_COUNT ? (
        <Pressable
          onPress={() => openInBrowser(`${MIRLO_WEB}/${artist.urlSlug}/posts`)}
          accessibilityRole="link"
        >
          <Text style={styles.morePosts}>All posts on Mirlo</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function PostCard({
  post,
  artist,
  routeId,
  open,
  onToggle,
}: {
  post: ArtistPost;
  artist: Artist;
  routeId: string;
  open: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const body = htmlToMarkdown(post.content);
  const date = new Date(post.publishedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <View style={styles.card}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={post.title}
      >
        <View style={styles.titleRow}>
          <View style={styles.titleText}>
            <Text style={styles.title}>{post.title}</Text>
            <Text style={styles.date}>{date}</Text>
          </View>
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={18}
            color={theme.colors.textSecondary}
          />
        </View>
        {!open && body ? (
          <View style={styles.excerpt}>
            <Markdown style={markdownStyle} onLinkPress={openLink}>
              {body}
            </Markdown>
          </View>
        ) : null}
      </Pressable>

      {open ? (
        <View style={styles.full}>
          {post.featuredImage?.src ? (
            <Image source={{ uri: post.featuredImage.src }} style={styles.image} resizeMode="cover" />
          ) : null}
          {body ? (
            <Markdown style={markdownStyle} onLinkPress={openLink}>
              {body}
            </Markdown>
          ) : null}
          <Pressable
            onPress={() =>
              openInBrowser(`${MIRLO_WEB}/${artist.urlSlug}/posts/${post.urlSlug || post.id}/`)
            }
            accessibilityRole="link"
          >
            <Text style={styles.link}>Open on Mirlo</Text>
          </Pressable>
        </View>
      ) : null}

      {post.isContentHidden ? (
        <View style={styles.locked}>
          <Ionicons name="lock-closed-outline" size={14} color={theme.colors.textSecondary} />
          <Text style={styles.lockedText}>This post is for {artist.name}'s subscribers.</Text>
          <Pressable
            onPress={() => openPurchase(router, { kind: "support", artist: routeId })}
            accessibilityRole="button"
            accessibilityLabel={`Support ${artist.name}`}
          >
            <Text style={styles.link}>Support</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.surfaceCardBorder,
    gap: 10,
  },
  header: {
    ...theme.typography.sectionHeader,
  },
  card: {
    padding: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
    gap: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  titleText: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  date: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  excerpt: {
    maxHeight: 66,
    overflow: "hidden",
    marginTop: 4,
  },
  full: {
    gap: 8,
  },
  image: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceElevated,
  },
  locked: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  lockedText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    flexShrink: 1,
  },
  link: {
    color: theme.colors.textCyan,
    fontSize: 13,
    fontWeight: "600",
  },
  morePosts: {
    color: theme.colors.textCyan,
    fontSize: 14,
    fontWeight: "600",
  },
});

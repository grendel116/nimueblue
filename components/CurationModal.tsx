import { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Button, ModalShell, Pill } from "@/components/ui";
import { theme } from "@/constants/theme";
import {
  removeCustomPodcast,
  removeCustomStation,
  setContentFilters,
  upsertCustomPodcast,
  upsertCustomStation,
  useCurationConfig,
} from "@/queries/excludedContent";
import { fetchPodcastShowFromRss } from "@/queries/podcast";

export type CurationTab = "stations" | "podcasts" | "filters";

function splitList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,]+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
}

function isHttpUrl(raw: string): boolean {
  return /^https?:\/\//i.test(raw.trim());
}

function fallbackFeedName(feedUrl: string): string {
  try {
    return new URL(feedUrl).hostname.replace(/^www\./, "") || "Podcast";
  } catch {
    return "Podcast";
  }
}

export default function CurationModal({
  visible,
  initialTab = "stations",
  onClose,
}: {
  visible: boolean;
  initialTab?: CurationTab;
  onClose: () => void;
}) {
  const config = useCurationConfig();
  const [tab, setTab] = useState<CurationTab>(initialTab);

  const [stationName, setStationName] = useState("");
  const [stationUrl, setStationUrl] = useState("");
  const [stationError, setStationError] = useState("");

  const [podcastUrl, setPodcastUrl] = useState("");
  const [podcastBusy, setPodcastBusy] = useState(false);
  const [podcastError, setPodcastError] = useState("");

  const [filterText, setFilterText] = useState("");
  const [filterSaved, setFilterSaved] = useState(false);

  useEffect(() => {
    if (visible) {
      setTab(initialTab);
      setStationError("");
      setPodcastError("");
      setFilterSaved(false);
    }
  }, [visible, initialTab]);

  useEffect(() => {
    const merged = splitList([
      ...config.filters.excludedTerms,
      ...config.filters.excludedCountries,
    ].join(", "));
    setFilterText(merged.join(", "));
  }, [config]);

  const handleAddStation = () => {
    const name = stationName.trim();
    const streamUrl = stationUrl.trim();
    if (!name) {
      setStationError("Enter a station name.");
      return;
    }
    if (!isHttpUrl(streamUrl)) {
      setStationError("Enter a valid stream URL (https://...).");
      return;
    }
    setStationError("");
    upsertCustomStation({ name, streamUrl, isCustom: true });
    setStationName("");
    setStationUrl("");
  };

  const handleAddPodcast = async () => {
    const feedUrl = podcastUrl.trim();
    if (!isHttpUrl(feedUrl)) {
      setPodcastError("Enter a valid RSS feed URL (https://...).");
      return;
    }
    setPodcastError("");
    setPodcastBusy(true);
    try {
      let spec;
      try {
        spec = await fetchPodcastShowFromRss(feedUrl);
      } catch {
        spec = {
          name: fallbackFeedName(feedUrl),
          feedUrl,
          webUrl: feedUrl,
          isCustom: true,
        };
      }
      upsertCustomPodcast(spec);
      setPodcastUrl("");
    } finally {
      setPodcastBusy(false);
    }
  };

  const handleSaveFilters = () => {
    const items = splitList(filterText);
    setContentFilters({
      excludedTerms: items,
      excludedCountries: items.map((item) => item.toLowerCase()),
    });
    setFilterSaved(true);
  };

  return (
    <ModalShell
      visible={visible}
      onClose={onClose}
      title="Customize"
      cardStyle={styles.modalCard}
    >
      <View style={styles.tabRow}>
        <Pill
          label="Radio"
          count={config.stations.length || undefined}
          icon="radio-outline"
          size="sm"
          active={tab === "stations"}
          onPress={() => setTab("stations")}
        />
        <Pill
          label="Podcasts"
          count={config.podcasts.length || undefined}
          icon="mic-outline"
          size="sm"
          active={tab === "podcasts"}
          onPress={() => setTab("podcasts")}
        />
        <Pill
          label="Filters"
          icon="options-outline"
          size="sm"
          active={tab === "filters"}
          onPress={() => setTab("filters")}
        />
      </View>

      <ScrollView
        style={styles.scrollBody}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {tab === "stations" && (
          <View style={styles.section}>
            <TextInput
              style={styles.input}
              value={stationName}
              onChangeText={setStationName}
              placeholder="Station name"
              placeholderTextColor={theme.colors.textMuted}
            />
            <TextInput
              style={styles.input}
              value={stationUrl}
              onChangeText={setStationUrl}
              placeholder="Stream URL (https://...)"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {stationError ? <Text style={styles.errorText}>{stationError}</Text> : null}
            <Button
              label="Add Station"
              icon="add"
              onPress={handleAddStation}
              fullWidth
            />

            {config.stations.length > 0 && (
              <View style={styles.list}>
                {config.stations.map((station) => (
                  <View key={station.id} style={styles.itemRow}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {station.name}
                    </Text>
                    <Pressable
                      onPress={() => removeCustomStation(station.id)}
                      style={styles.deleteBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${station.name}`}
                    >
                      <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {tab === "podcasts" && (
          <View style={styles.section}>
            <TextInput
              style={styles.input}
              value={podcastUrl}
              onChangeText={setPodcastUrl}
              placeholder="RSS feed URL (https://...)"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {podcastError ? <Text style={styles.errorText}>{podcastError}</Text> : null}
            <Button
              label="Add Podcast"
              icon="add"
              loading={podcastBusy}
              onPress={() => void handleAddPodcast()}
              fullWidth
            />

            {config.podcasts.length > 0 && (
              <View style={styles.list}>
                {config.podcasts.map((show) => (
                  <View key={show.id} style={styles.itemRow}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {show.name}
                    </Text>
                    <Pressable
                      onPress={() => removeCustomPodcast(show.id)}
                      style={styles.deleteBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${show.name}`}
                    >
                      <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {tab === "filters" && (
          <View style={styles.section}>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={filterText}
              onChangeText={(text) => {
                setFilterText(text);
                setFilterSaved(false);
              }}
              multiline
              placeholder="Hide words, tags, or countries (comma-separated)"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
            />
            {filterSaved ? <Text style={styles.noticeText}>Saved.</Text> : null}
            <Button
              label="Save"
              onPress={handleSaveFilters}
              fullWidth
            />
          </View>
        )}
      </ScrollView>

      <Button
        label="Done"
        variant="secondary"
        onPress={onClose}
        fullWidth
        style={styles.doneBtn}
      />
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  modalCard: {
    maxWidth: 400,
    maxHeight: "82%",
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
    marginBottom: 14,
  },
  scrollBody: {
    maxHeight: 340,
  },
  scrollContent: {
    paddingBottom: 4,
  },
  section: {
    gap: 10,
  },
  list: {
    gap: 6,
    marginTop: 6,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
    borderRadius: theme.radius.md,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 8,
    gap: 8,
  },
  itemTitle: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  deleteBtn: {
    padding: 6,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.surfaceGlassBorder,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.textPrimary,
    fontSize: 14,
    outlineStyle: "none" as any,
    outlineWidth: 0 as any,
  },
  multilineInput: {
    minHeight: 84,
    textAlignVertical: "top",
  },
  doneBtn: {
    marginTop: 12,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 12,
  },
  noticeText: {
    color: theme.colors.textCyan,
    fontSize: 12,
  },
});

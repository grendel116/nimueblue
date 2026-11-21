import { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Button, ModalShell, Pill } from "@/components/ui";
import { theme } from "@/constants/theme";
import {
  loadMigratedCurationPreset,
  normalizeCurationConfig,
  removeCustomPodcast,
  removeCustomStation,
  resetCurationConfig,
  setContentFilters,
  setCurationConfig,
  upsertCustomPodcast,
  upsertCustomStation,
  useCurationConfig,
} from "@/queries/excludedContent";
import { fetchPodcastShowFromRss } from "@/queries/podcast";

export type CurationTab = "stations" | "podcasts" | "filters";

function splitCommaList(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitLineList(raw: string): string[] {
  return raw
    .split(/\r?\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isHttpUrl(raw: string): boolean {
  return /^https?:\/\//i.test(raw.trim());
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

  // Custom station form state
  const [stName, setStName] = useState("");
  const [stStreamUrl, setStStreamUrl] = useState("");
  const [stLocation, setStLocation] = useState("");
  const [stArtwork, setStArtwork] = useState("");
  const [stHomepage, setStHomepage] = useState("");
  const [stNowPlaying, setStNowPlaying] = useState("");
  const [stTags, setStTags] = useState("");
  const [stError, setStError] = useState("");

  // Custom podcast form state
  const [podFeedUrl, setPodFeedUrl] = useState("");
  const [podName, setPodName] = useState("");
  const [podAuthor, setPodAuthor] = useState("");
  const [podArtwork, setPodArtwork] = useState("");
  const [podWebUrl, setPodWebUrl] = useState("");
  const [podBusy, setPodBusy] = useState(false);
  const [podError, setPodError] = useState("");

  // Filters form state
  const [termsText, setTermsText] = useState("");
  const [patternsText, setPatternsText] = useState("");
  const [countriesText, setCountriesText] = useState("");
  const [radioTagsText, setRadioTagsText] = useState("");
  const [podcastTermsText, setPodcastTermsText] = useState("");
  const [excludeCommercial, setExcludeCommercial] = useState(false);
  const [filterNotice, setFilterNotice] = useState("");

  // JSON import / export state
  const [showJson, setShowJson] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState("");

  useEffect(() => {
    if (visible) {
      setTab(initialTab);
      setStError("");
      setPodError("");
      setFilterNotice("");
      setJsonError("");
    }
  }, [visible, initialTab]);

  useEffect(() => {
    setTermsText(config.filters.excludedTerms.join(", "));
    setPatternsText(config.filters.excludedPatterns.join("\n"));
    setCountriesText(config.filters.excludedCountries.join(", "));
    setRadioTagsText(config.filters.radioDiscoveryTags.join(", "));
    setPodcastTermsText(config.filters.podcastDiscoveryTerms.join(", "));
    setExcludeCommercial(config.filters.excludeCommercialFormatNames);
    setJsonText(JSON.stringify(config, null, 2));
  }, [config]);

  const handleAddStation = () => {
    const name = stName.trim();
    const streamUrl = stStreamUrl.trim();
    if (!name) {
      setStError("Enter a station name.");
      return;
    }
    if (!isHttpUrl(streamUrl)) {
      setStError("Enter a valid http:// or https:// stream URL.");
      return;
    }
    setStError("");
    upsertCustomStation({
      name,
      streamUrl,
      location: stLocation.trim() || undefined,
      artwork: stArtwork.trim() || undefined,
      playlistPage: stHomepage.trim() || undefined,
      donatePage: stHomepage.trim() || undefined,
      nowPlayingUrl: stNowPlaying.trim() || undefined,
      tags: splitCommaList(stTags),
      isCustom: true,
    });
    setStName("");
    setStStreamUrl("");
    setStLocation("");
    setStArtwork("");
    setStHomepage("");
    setStNowPlaying("");
    setStTags("");
  };

  const handleAddPodcast = async () => {
    const feedUrl = podFeedUrl.trim();
    if (!isHttpUrl(feedUrl)) {
      setPodError("Enter a valid http:// or https:// RSS feed URL.");
      return;
    }
    setPodError("");
    setPodBusy(true);
    try {
      let spec;
      try {
        spec = await fetchPodcastShowFromRss(feedUrl, {
          name: podName.trim() || undefined,
          author: podAuthor.trim() || undefined,
          artwork: podArtwork.trim() || undefined,
          webUrl: podWebUrl.trim() || undefined,
        });
      } catch (err) {
        if (!podName.trim()) {
          throw err;
        }
        spec = {
          name: podName.trim(),
          author: podAuthor.trim() || podName.trim(),
          artwork: podArtwork.trim() || undefined,
          feedUrl,
          webUrl: podWebUrl.trim() || feedUrl,
          isCustom: true,
        };
      }
      upsertCustomPodcast(spec);
      setPodFeedUrl("");
      setPodName("");
      setPodAuthor("");
      setPodArtwork("");
      setPodWebUrl("");
    } catch (err) {
      setPodError(
        err instanceof Error
          ? `${err.message}. Enter a show name to add without fetching metadata.`
          : "Couldn't read that RSS feed.",
      );
    } finally {
      setPodBusy(false);
    }
  };

  const handleSaveFilters = () => {
    setContentFilters({
      excludedTerms: splitCommaList(termsText),
      excludedPatterns: splitLineList(patternsText),
      excludedCountries: splitCommaList(countriesText).map((c) => c.toLowerCase()),
      excludeCommercialFormatNames: excludeCommercial,
      radioDiscoveryTags: splitCommaList(radioTagsText).map((t) => t.toLowerCase()),
      podcastDiscoveryTerms: splitCommaList(podcastTermsText).map((t) => t.toLowerCase()),
    });
    setFilterNotice("Filters saved.");
  };

  const handleImportJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      const normalized = normalizeCurationConfig(parsed);
      setCurationConfig(normalized);
      setJsonError("");
      setFilterNotice("Imported curation JSON.");
    } catch {
      setJsonError("Invalid JSON format.");
    }
  };

  return (
    <ModalShell
      visible={visible}
      onClose={onClose}
      title="Stations, Feeds & Filters"
      message="Base discovery feeds are open and unrestricted. Add custom radio stations, podcast RSS feeds, or client-side filters."
      cardStyle={styles.modalCard}
    >
      <View style={styles.tabRow}>
        <Pill
          label="Stations"
          count={config.stations.length}
          icon="radio-outline"
          size="sm"
          active={tab === "stations"}
          onPress={() => setTab("stations")}
        />
        <Pill
          label="Podcasts"
          count={config.podcasts.length}
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
            {config.stations.length > 0 && (
              <View style={styles.listBlock}>
                <Text style={styles.subHeading}>Custom Stations</Text>
                {config.stations.map((station) => (
                  <View key={station.id} style={styles.itemRow}>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {station.name}
                      </Text>
                      <Text style={styles.itemSub} numberOfLines={1}>
                        {station.location ? `${station.location} • ` : ""}
                        {station.streamUrl}
                      </Text>
                    </View>
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

            <Text style={styles.subHeading}>Add Custom Station</Text>
            <Text style={styles.label}>Station Name *</Text>
            <TextInput
              style={styles.input}
              value={stName}
              onChangeText={setStName}
              placeholder="e.g. KEXP"
              placeholderTextColor={theme.colors.textMuted}
            />
            <Text style={styles.label}>Stream URL *</Text>
            <TextInput
              style={styles.input}
              value={stStreamUrl}
              onChangeText={setStStreamUrl}
              placeholder="https://stream.example.com/live.aac"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.label}>Location (optional)</Text>
            <TextInput
              style={styles.input}
              value={stLocation}
              onChangeText={setStLocation}
              placeholder="City, Country"
              placeholderTextColor={theme.colors.textMuted}
            />
            <Text style={styles.label}>Artwork URL (optional)</Text>
            <TextInput
              style={styles.input}
              value={stArtwork}
              onChangeText={setStArtwork}
              placeholder="https://example.com/logo.png"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.label}>Website / Donate URL (optional)</Text>
            <TextInput
              style={styles.input}
              value={stHomepage}
              onChangeText={setStHomepage}
              placeholder="https://example.com/"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.label}>Now-Playing JSON URL (optional)</Text>
            <TextInput
              style={styles.input}
              value={stNowPlaying}
              onChangeText={setStNowPlaying}
              placeholder="https://api.example.com/nowplaying"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.label}>Tags (comma-separated, optional)</Text>
            <TextInput
              style={styles.input}
              value={stTags}
              onChangeText={setStTags}
              placeholder="community radio, jazz, freeform"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
            />
            {stError ? <Text style={styles.errorText}>{stError}</Text> : null}
            <Button
              label="Add Station"
              icon="add-circle-outline"
              onPress={handleAddStation}
              fullWidth
              style={styles.submitBtn}
            />
          </View>
        )}

        {tab === "podcasts" && (
          <View style={styles.section}>
            {config.podcasts.length > 0 && (
              <View style={styles.listBlock}>
                <Text style={styles.subHeading}>Custom Podcast Feeds</Text>
                {config.podcasts.map((show) => (
                  <View key={show.id} style={styles.itemRow}>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {show.name}
                      </Text>
                      <Text style={styles.itemSub} numberOfLines={1}>
                        {show.author ? `${show.author} • ` : ""}
                        {show.feedUrl}
                      </Text>
                    </View>
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

            <Text style={styles.subHeading}>Add Podcast RSS Feed</Text>
            <Text style={styles.label}>RSS Feed URL *</Text>
            <TextInput
              style={styles.input}
              value={podFeedUrl}
              onChangeText={setPodFeedUrl}
              placeholder="https://example.com/feed.xml"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.label}>Show Name (optional — auto-read from RSS)</Text>
            <TextInput
              style={styles.input}
              value={podName}
              onChangeText={setPodName}
              placeholder="Leave blank to detect from feed"
              placeholderTextColor={theme.colors.textMuted}
            />
            <Text style={styles.label}>Author (optional)</Text>
            <TextInput
              style={styles.input}
              value={podAuthor}
              onChangeText={setPodAuthor}
              placeholder="Host or publisher"
              placeholderTextColor={theme.colors.textMuted}
            />
            <Text style={styles.label}>Artwork URL (optional)</Text>
            <TextInput
              style={styles.input}
              value={podArtwork}
              onChangeText={setPodArtwork}
              placeholder="https://example.com/cover.jpg"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.label}>Website URL (optional)</Text>
            <TextInput
              style={styles.input}
              value={podWebUrl}
              onChangeText={setPodWebUrl}
              placeholder="https://example.com/"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {podError ? <Text style={styles.errorText}>{podError}</Text> : null}
            <Button
              label="Add Podcast Feed"
              icon="add-circle-outline"
              loading={podBusy}
              onPress={() => void handleAddPodcast()}
              fullWidth
              style={styles.submitBtn}
            />
          </View>
        )}

        {tab === "filters" && (
          <View style={styles.section}>
            <Text style={styles.subHeading}>Presets & Migration</Text>
            <View style={styles.presetActions}>
              <Button
                label="Load Migrated Preset"
                size="sm"
                icon="sparkles-outline"
                onPress={() => {
                  loadMigratedCurationPreset();
                  setFilterNotice("Loaded migrated stations, podcasts & filters.");
                }}
                style={styles.presetBtn}
              />
              <Button
                label="Reset Unrestricted"
                size="sm"
                variant="destructive"
                icon="refresh-outline"
                onPress={() => {
                  resetCurationConfig();
                  setFilterNotice("Reset to open, unrestricted feeds.");
                }}
                style={styles.presetBtn}
              />
            </View>
            <Button
              label={showJson ? "Hide JSON Import / Export" : "Import / Export JSON"}
              size="sm"
              variant="secondary"
              icon="code-slash-outline"
              onPress={() => setShowJson((v) => !v)}
              fullWidth
            />

            {showJson && (
              <View style={styles.jsonBox}>
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  value={jsonText}
                  onChangeText={setJsonText}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {jsonError ? <Text style={styles.errorText}>{jsonError}</Text> : null}
                <Button
                  label="Apply JSON"
                  size="sm"
                  onPress={handleImportJson}
                  fullWidth
                />
              </View>
            )}

            <View style={styles.switchRow}>
              <View style={styles.switchLabelCol}>
                <Text style={styles.label}>Hide Commercial Format Names</Text>
                <Text style={styles.helperText}>
                  Exclude dashed radio networks (- 0 N -) and ad-copy markers (-&gt;, @)
                </Text>
              </View>
              <Switch
                value={excludeCommercial}
                onValueChange={setExcludeCommercial}
                trackColor={{
                  false: theme.colors.progressTrack,
                  true: theme.colors.primarySoftStrong,
                }}
                thumbColor={excludeCommercial ? theme.colors.primary : theme.colors.textSecondary}
              />
            </View>

            <Text style={styles.label}>Excluded Words & Tags (comma-separated)</Text>
            <TextInput
              style={[styles.input, styles.multilineSmall]}
              value={termsText}
              onChangeText={setTermsText}
              multiline
              placeholder="top, chart, forbes, k-pop..."
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
            />

            <Text style={styles.label}>Excluded Countries / Codes (comma-separated)</Text>
            <TextInput
              style={[styles.input, styles.multilineSmall]}
              value={countriesText}
              onChangeText={setCountriesText}
              multiline
              placeholder="Leave empty for all countries"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
            />

            <Text style={styles.label}>Excluded Regex Patterns (one per line)</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={patternsText}
              onChangeText={setPatternsText}
              multiline
              placeholder="One regular expression per line"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>Radio Discovery Tags (comma-separated)</Text>
            <TextInput
              style={styles.input}
              value={radioTagsText}
              onChangeText={setRadioTagsText}
              placeholder="Leave empty for unrestricted global discovery"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
            />

            <Text style={styles.label}>Podcast Discovery Terms (comma-separated)</Text>
            <TextInput
              style={styles.input}
              value={podcastTermsText}
              onChangeText={setPodcastTermsText}
              placeholder="Leave empty for all Castopod feeds"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
            />

            {filterNotice ? <Text style={styles.noticeText}>{filterNotice}</Text> : null}
            <Button
              label="Save Filters"
              icon="checkmark-circle-outline"
              onPress={handleSaveFilters}
              fullWidth
              style={styles.submitBtn}
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
    maxWidth: 460,
    maxHeight: "88%",
  },
  tabRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
  },
  scrollBody: {
    maxHeight: 420,
  },
  scrollContent: {
    paddingBottom: 12,
  },
  section: {
    gap: 8,
  },
  subHeading: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: 6,
  },
  listBlock: {
    gap: 6,
    marginBottom: 4,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
    borderRadius: theme.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  itemSub: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  deleteBtn: {
    padding: 6,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  helperText: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.surfaceGlassBorder,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: theme.colors.textPrimary,
    fontSize: 13,
    outlineStyle: "none" as any,
    outlineWidth: 0 as any,
  },
  multilineSmall: {
    minHeight: 56,
    textAlignVertical: "top",
  },
  multilineInput: {
    minHeight: 96,
    textAlignVertical: "top",
    fontFamily: "monospace",
    fontSize: 12,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 6,
  },
  switchLabelCol: {
    flex: 1,
  },
  presetActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  presetBtn: {
    flex: 1,
  },
  jsonBox: {
    gap: 8,
    marginVertical: 4,
  },
  submitBtn: {
    marginTop: 6,
  },
  doneBtn: {
    marginTop: 10,
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

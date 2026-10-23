import { useSearch } from "@/state/SearchContext";
import { useCallback, useRef } from "react";
import { TextInput, StyleSheet, View, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@/constants/theme";

export default function SearchInput() {
  const { searchValue, setSearchValue, clearSearch } = useSearch();
  const inputRef = useRef<TextInput>(null);

  const onChangeValue = useCallback(
    (text: string) => {
      setSearchValue(text);
    },
    [setSearchValue],
  );

  const handleClear = useCallback(() => {
    clearSearch();
    inputRef.current?.focus();
  }, [clearSearch]);

  return (
    <View style={styles.container}>
      <View style={styles.inputWrapper}>
        <Ionicons
          name="search-outline"
          size={18}
          color={theme.colors.primary}
          style={styles.searchIcon}
        />
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="Search tracks, artists, genres, tags..."
          placeholderTextColor={theme.colors.textMuted}
          value={searchValue}
          onChangeText={onChangeValue}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          underlineColorAndroid="transparent"
        />
        {searchValue.length > 0 && (
          <Pressable
            onPress={handleClear}
            style={styles.clearBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Clear search query"
          >
            <Ionicons
              name="close-circle"
              size={18}
              color={theme.colors.textSecondary}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.surfaceGlassBorder,
    height: 42,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: theme.colors.textPrimary,
    height: "100%",
    fontSize: 15,
    paddingVertical: 0,
    outlineStyle: "none" as any,
    outlineWidth: 0 as any,
  },
  clearBtn: {
    marginLeft: 6,
    padding: 2,
  },
});

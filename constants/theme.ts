// NimueBlue - Nightwing Dark Mode Theme Tokens
const colors = {
  // Void Obsidian Backgrounds
  background: "#070b14",
  surface: "#0d1424",
  surfaceElevated: "#131e35",
  surfaceGlassBorder: "rgba(0, 210, 255, 0.18)",
  surfaceCardBorder: "rgba(255, 255, 255, 0.08)",
  ripple: "rgba(0, 210, 255, 0.16)",

  // Overlays: dark scrim behind sheets and badges, light wash for subtle fills
  scrim: "rgba(0, 0, 0, 0.65)",
  overlayLight: "rgba(255, 255, 255, 0.1)",
  shadow: "#000000",

  // Nightwing Electric Blue & Cyan Accents
  primary: "#00d2ff",
  primaryGlow: "rgba(0, 210, 255, 0.35)",
  primarySoft: "rgba(0, 210, 255, 0.12)",
  primarySoftStrong: "rgba(0, 210, 255, 0.2)",
  logo: "#00d2ff",

  // Like and wishlist hearts
  brandRed: "#BE3455",

  // Typography and icons
  textPrimary: "#f8fafc",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  danger: "#ff4d4d",
  textCyan: "#38bdf8",
  iconIdle: "#ababab",

  // Player & Transport
  progressTrack: "#1e293b",
  playButtonIcon: "#070b14",
};

const fonts = {
  display: "MedievalScroll",
  sans: "OpenSans",
};

export const theme = {
  colors,
  fonts,
  typography: {
    h1: {
      fontFamily: fonts.display,
      fontSize: 24,
      fontWeight: "normal" as const,
      color: colors.textPrimary,
      letterSpacing: 0.5,
    },
    sectionHeader: {
      fontFamily: fonts.sans,
      fontSize: 14,
      fontWeight: "700" as const,
      color: colors.primary,
      letterSpacing: 1.2,
    },
    body: { fontFamily: fonts.sans, fontSize: 14, color: colors.textSecondary },
    caption: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted },
  },
  radius: {
    xs: 3,
    sm: 6,
    md: 10,
    lg: 16,
    full: 9999,
  },
  // Largest size for album, station, and podcast cover art on wide screens
  coverMaxSize: 420,
};

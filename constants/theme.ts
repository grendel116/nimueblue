// NimueBlue - Nightwing Dark Mode Theme Tokens
export const theme = {
  colors: {
    // Void Obsidian Backgrounds
    background: "#070b14",
    surface: "#0d1424",
    surfaceElevated: "#131e35",
    surfaceGloss: "rgba(19, 30, 53, 0.75)",
    surfaceGlassBorder: "rgba(0, 210, 255, 0.18)",
    surfaceCardBorder: "rgba(255, 255, 255, 0.08)",
    ripple: "rgba(0, 210, 255, 0.16)",
    rippleLight: "rgba(255, 255, 255, 0.12)",

    // Nightwing Electric Blue & Cyan Accents
    primary: "#00d2ff",
    primaryGlow: "rgba(0, 210, 255, 0.35)",
    primaryGradientStart: "#00d2ff",
    primaryGradientEnd: "#0066ff",
    secondaryAccent: "#38bdf8",
    activeBadge: "#00e5ff",
    notificationDot: "#ff3b69",
    logo: "#00d2ff",

    // Typography
    textPrimary: "#f8fafc",
    textSecondary: "#94a3b8",
    textMuted: "#64748b",
    danger: "#ff4d4d",
    textCyan: "#38bdf8",

    // Player & Transport
    progressTrack: "#1e293b",
    progressFill: "#00d2ff",
    playButtonBg: "#00d2ff",
    playButtonIcon: "#070b14",
  },
  fonts: {
    display: "MedievalScroll",
    accent: "MedievalScroll",
    sans: "OpenSans",
  },
  typography: {
    fontFamily: "OpenSans",
    h1: {
      fontFamily: "MedievalScroll",
      fontSize: 24,
      fontWeight: "normal" as const,
      color: "#f8fafc",
      letterSpacing: 0.5,
    },
    h2: {
      fontFamily: "MedievalScroll",
      fontSize: 18,
      fontWeight: "normal" as const,
      color: "#f8fafc",
      letterSpacing: 0.5,
    },
    sectionHeader: {
      fontFamily: "OpenSans",
      fontSize: 14,
      fontWeight: "700" as const,
      color: "#00d2ff",
      letterSpacing: 1.2,
      textTransform: "uppercase" as const,
    },
    body: { fontFamily: "OpenSans", fontSize: 14, color: "#94a3b8" },
    caption: { fontFamily: "OpenSans", fontSize: 12, color: "#64748b" },
  },
  radius: {
    sm: 6,
    md: 10,
    lg: 16,
    full: 9999,
  },
  // Largest size for album, station, and podcast cover art on wide screens
  coverMaxSize: 420,
  shadows: {
    glossCard: {
      shadowColor: "#00d2ff",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 4,
    },
    neonGlow: {
      shadowColor: "#00d2ff",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.5,
      shadowRadius: 10,
      elevation: 6,
    },
  },
};

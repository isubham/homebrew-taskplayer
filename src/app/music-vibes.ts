export type AudiusVibeSource = {
  type: "genre" | "search";
  value: string;
  allowedGenres?: string[];
  includeTerms?: string[];
  excludeTerms?: string[];
};

export type MusicVibe = {
  label: string;
  sourceType: "audius" | "noise" | "favorites";
  sources: AudiusVibeSource[];
  preferredMoods?: string[];
};

const VOCAL_EXCLUSIONS = [" vocal", "feat.", " feat "];

export const MUSIC_VIBES: Record<string, MusicVibe> = {
  favorites: {
    label: "♥ Favorites",
    sourceType: "favorites",
    sources: [],
  },
  noise: {
    label: "📻 Noise",
    sourceType: "noise",
    sources: [],
  },
  nature: {
    label: "🌧️ Nature",
    sourceType: "audius",
    sources: [
      { type: "search", value: "rain sounds", allowedGenres: ["Ambient"], includeTerms: ["rain", "storm"] },
      { type: "search", value: "river sounds", allowedGenres: ["Ambient"], includeTerms: ["river", "stream", "waterfall"] },
      { type: "search", value: "wind sounds", allowedGenres: ["Ambient"], includeTerms: ["wind", "breeze"] },
    ],
    preferredMoods: ["Peaceful", "Easygoing"],
  },
  lofi: {
    label: "🎧 Lo-Fi",
    sourceType: "audius",
    sources: [{ type: "genre", value: "Lo-Fi", excludeTerms: VOCAL_EXCLUSIONS }],
    preferredMoods: ["Easygoing", "Peaceful", "Cool"],
  },
  ambient: {
    label: "🌌 Ambient",
    sourceType: "audius",
    sources: [
      { type: "genre", value: "Ambient", excludeTerms: VOCAL_EXCLUSIONS },
      {
        type: "search",
        value: "singing bowls",
        allowedGenres: ["Ambient", "Devotional", "Experimental"],
        includeTerms: ["singing bowl", "tibetan bowl"],
      },
    ],
    preferredMoods: ["Peaceful", "Tender", "Easygoing"],
  },
  coffee: {
    label: "☕ Coffee House",
    sourceType: "audius",
    sources: [
      { type: "genre", value: "Acoustic", excludeTerms: VOCAL_EXCLUSIONS },
      { type: "genre", value: "Jazz", excludeTerms: VOCAL_EXCLUSIONS },
      { type: "genre", value: "Downtempo", excludeTerms: VOCAL_EXCLUSIONS },
    ],
    preferredMoods: ["Easygoing", "Sophisticated", "Peaceful", "Cool"],
  },
  soundtrack: {
    label: "🎮 Game OST",
    sourceType: "audius",
    sources: [
      { type: "genre", value: "Soundtrack", excludeTerms: VOCAL_EXCLUSIONS },
      {
        type: "search",
        value: "game soundtrack",
        allowedGenres: ["Soundtrack", "Electronic", "Ambient"],
        includeTerms: ["game", "soundtrack", "ost"],
        excludeTerms: VOCAL_EXCLUSIONS,
      },
    ],
    preferredMoods: ["Stirring", "Cool", "Energizing", "Peaceful"],
  },
  classical: {
    label: "🎻 Classical",
    sourceType: "audius",
    sources: [{ type: "genre", value: "Classical", excludeTerms: VOCAL_EXCLUSIONS }],
    preferredMoods: ["Sophisticated", "Peaceful", "Tender"],
  },
  energizing: {
    label: "⚡ Energizing",
    sourceType: "audius",
    sources: [
      { type: "genre", value: "Electronic", excludeTerms: VOCAL_EXCLUSIONS },
      { type: "genre", value: "House", excludeTerms: VOCAL_EXCLUSIONS },
    ],
    preferredMoods: ["Energizing", "Upbeat", "Excited", "Empowering"],
  },
};

export const LEGACY_MUSIC_VIBE_KEYS: Record<string, string> = {
  jazz: "coffee",
  electronic: "energizing",
};

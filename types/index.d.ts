interface LoggedInUser {
  email: string;
  name: string;
  id: number;
  urlSlug?: string;
  artists?: Artist[];
  artistUserSubscriptions?: ArtistUserSubscription[];
  userTrackGroupPurchases?: { trackGroupId: number }[];
  userTrackPurchases?: { trackId: number }[];
  currency?: string;
}

interface AlbumProps {
  id: number;
  cover: {
    sizes: {
      60: string;
      120: string;
      300: string;
      600: string;
      960: string;
      1200: string;
      1500: string;
    };
  };
  title: string;
  artist: Artist;
  artistId: number;
  urlSlug: string;
  userTrackGroupPurchases?: { userId: number }[];
  releaseDate: string;
  tracks?: RNTrack[];
  about?: string;
  tags?: string[];
  trackGroupId: number;
  // Prices in cents; anything at or above minPrice is accepted
  minPrice?: number | null;
  suggestedPrice?: number | null;
  currency?: string;
  // False when the release comes only with a subscription
  isGettable?: boolean;
  // The Mirlo user paid for this release when it isn't the artist's own account
  paymentToUserId?: number | null;
  source?: string;
  sourceUrl?: string;
  purchaseLinks?: { label: string; url: string }[];
}

interface RNTrack {
  title: string;
  artist: string;
  artwork?: string;
  trackArtists?: {
    role?: string;
    artistId?: number;
    artistName?: string;
    isCoAuthor?: boolean;
    trackId?: number;
  }[];
  allowIndividualSale: boolean;
  url: string;
  id: number;
  queueIndex: number;
  trackGroupId: number;
  trackGroup: {
    id: number;
    releaseDate: string;
    trackGroupId: number;
    title: string;
    userTrackGroupPurchases?: { userId: number }[];
    artist: Artist;
    artistId: number;
    urlSlug: string;
    cover: {
      sizes: {
        60: string;
        120: string;
        300: string;
        600: string;
        960: string;
        1200: string;
        1500: string;
      };
    };
    source?: string;
    sourceUrl?: string;
    purchaseLinks?: { label: string; url: string }[];
  };
  audio: {
    url: string;
    duration: number | undefined;
  };
  isPreview: boolean;
  order: number;
  headers: {};
  type?: import("react-native-track-player").TrackType;
  fairplayerTrackId?: string;
  source?: string;
  sourceUrl?: string;
  // Length in seconds the lock screen shows; streams report their own
  duration?: number;
  // Added by autoplay after the chosen playlist ran out
  autoplay?: boolean;
  // Picked by the listener with Add to queue: plays right after the current song
  queued?: boolean;
  // Station id of a live radio stream: a 10-minute set with no seeking, then the queue moves on
  liveStation?: string;
  // Album key of a song saved on this phone, the album it opens in Library > Downloads
  downloadAlbum?: string;
  // Podcast show id if this track is a podcast episode
  podcastId?: string;
  // Podcast episode id or GUID
  podcastEpisodeId?: string;
  // Stable unique key for preserving row identity across queue reorders
  _queueKey?: string;
}

interface PropsWithChildren<P> extends P {
  children?: ReactNode;
}

interface PlayPauseWrapperProps {
  trackObject: RNTrack;
  playableTracks: RNTrack[];
  style?: StyleProp<ViewStyle>;
  selectedAlbum?: AlbumProps;
}

interface Artist {
  name: string;
  bio: string;
  activityPub: boolean;
  // The artist's support page on their host, set by each host's artist loader
  supportUrl?: string;
  urlSlug?: string;
  userId: number;
  id: number;
  location?: string;
  enabled: boolean;
  createdAt: string;
  trackGroups: AlbumProps[];
  // Legacy plain URLs; linksJson is what the artist edits today
  links?: string[];
  linksJson?: ArtistLink[];
  user?: { currency?: string };
  // The default tier is the free "follow" tier; any other tier is a paid subscription
  subscriptionTiers?: SubscriptionTier[];
  // The wide banner image across the top of the artist page
  background?: {
    url?: string;
    sizes?: { [key: string]: string };
    updatedAt?: string;
  };
  purchaseEntireCatalogEnabled?: boolean;
  allowDirectMessages?: boolean;
  // The account paid for this artist's sales (a label's account, or the artist's own)
  paymentToUserId?: number | null;
  posts?: ArtistPost[];
  avatar?: {
    url: string;
    sizes?: { [key: string]: string };
    updatedAt: string;
  };
  maxFreePlays?: number;
}

interface Tag {
  tag: string;
}

interface ArtistLink {
  url: string;
  linkType?: string;
  linkLabel?: string;
  iconUrl?: string;
  inHeader?: boolean;
}

interface SubscriptionTier {
  id: number;
  name: string;
  description?: string;
  artistId: number;
  isDefaultTier: boolean;
  // Cents
  minAmount?: number;
  defaultAmount?: number | null;
  allowVariable?: boolean;
  interval?: "MONTH" | "YEAR";
  artist?: Artist;
}

interface ArtistPost {
  id: number;
  title: string;
  urlSlug?: string | null;
  // HTML
  content?: string;
  publishedAt: string;
  isContentHidden?: boolean;
  featuredImage?: { src?: string };
  artistId?: number;
  artist?: Artist;
}

// One follow (default tier) or paid subscription (any other tier) from /auth/profile
interface ArtistUserSubscription {
  id: number;
  amount: number;
  currency?: string;
  userId: number;
  artistSubscriptionTierId?: number;
  artistSubscriptionTier: SubscriptionTier;
}

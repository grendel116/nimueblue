export interface ChorusImage {
  src: string;
  alt?: string | null;
  width?: number;
  height?: number;
}

export interface ChorusMedia {
  src: string;
  type: string;
}

export interface ChorusLink {
  name?: string;
  label?: string;
  href: string;
  type?: string;
  rel?: string;
  icon?: {
    src?: string;
    alt?: string;
    width?: number;
    height?: number;
  };
}

export interface ChorusTrack {
  type: "track";
  id?: string | number;
  name: string;
  url: string;
  duration?: number;
  track?: number;
  updated_date?: string;
  tags?: string[];
  media?: ChorusMedia[];
}

export interface ChorusAlbum {
  type: "album";
  uid?: string | number;
  name: string;
  url: string;
  release_date?: string;
  updated_date?: string;
  license?: string;
  artist?: string;
  tags?: string[];
  genre?: string | string[];
  images?: {
    cover?: ChorusImage;
    [key: string]: ChorusImage | undefined;
  };
  links?: ChorusLink[];
  description?: string;
  children?: ChorusTrack[];
}

export interface ChorusArtist {
  type: "artist";
  name: string;
  url: string;
  tags?: string[];
  images?: {
    cover?: ChorusImage;
    [key: string]: ChorusImage | undefined;
  };
  summary?: string;
  description?: string;
  links?: ChorusLink[];
  children?: ChorusAlbum[];
}

export interface ChorusDeletedEntity {
  type: "artist" | "album" | "track";
  name?: string;
  url: string;
}

export interface ChorusRoot {
  type: "root";
  url: string;
  children: ChorusArtist[];
  deleted?: ChorusDeletedEntity[];
}

export interface ChorusQueryOptions {
  host?: string;
  fromDate?: string;
  skip?: number;
  take?: number;
  endpoint?: string;
}

export interface FederationNode {
  id: string;
  name: string;
  url: string;
  endpoint?: string;
  enabled: boolean;
  isDefault?: boolean;
  type?: "mirlo" | "faircamp" | "chorus";
  lastSynced?: string;
  itemCount?: number;
}

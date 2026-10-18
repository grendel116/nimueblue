import { useRouter } from "expo-router";
import { Pill } from "@/components/ui";

type TagPillProps = {
  key?: number;
  tagName: string;
};

export default function TagPill({ tagName }: TagPillProps) {
  const router = useRouter();
  return (
    <Pill
      label={`#${tagName}`}
      variant="tag"
      onPress={() => router.push(`/tags/${encodeURIComponent(tagName)}` as const)}
      style={{ marginRight: 6, marginVertical: 4 }}
    />
  );
}

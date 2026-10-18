import TrackGroupListScreen from "@/components/TrackGroupListScreen";
import { queryMostPlayed } from "@/queries/queries";

export default function MostPlayed() {
  return <TrackGroupListScreen title="Most Listened To" query={queryMostPlayed({})} />;
}

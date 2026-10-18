import TrackGroupListScreen from "@/components/TrackGroupListScreen";
import { queryTopSold } from "@/queries/queries";

export default function TopSold() {
  return <TrackGroupListScreen title="Popular Purchases" query={queryTopSold({})} />;
}

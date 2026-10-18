import type { AlertButton } from "react-native";
import { createStore } from "./store";

// The choice the phone is showing, if any. askChoice sets it; ChoiceSheet draws it
export type Choice = { title: string; message?: string; buttons: AlertButton[] };

const choiceStore = createStore<Choice | null>(null);

export const showChoice = (next: Choice | null) => choiceStore.set(next);
export const useChoice = () => choiceStore.useStore();

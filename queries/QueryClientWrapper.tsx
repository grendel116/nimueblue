import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from "@tanstack/react-query";
import { AppState, Platform } from "react-native";
import { MirloFetchError } from "./fetch/MirloFetchError";

// Coming back to the app reloads stale data
if (Platform.OS !== "web") {
  focusManager.setEventListener((setFocused) => {
    const subscription = AppState.addEventListener("change", (state) =>
      setFocused(state === "active"),
    );
    return () => subscription.remove();
  });
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds
      retry: (failureCount, error) => {
        if (
          error instanceof MirloFetchError &&
          (error.status === 400 || error.status === 401)
        ) {
          return false;
        }

        return failureCount <= 1;
      },
    },
  },
});

export function QueryClientWrapper(
  props: React.PropsWithChildren<{ devTools?: boolean }>
) {
  return (
    <QueryClientProvider client={queryClient}>
      {props.children}
    </QueryClientProvider>
  );
}

// The web app running inside the Android app's WebView. The phone side owns the music folder,
// the saved songs and their files; the page asks it for work and hears back through messages

export const IN_NATIVE_SHELL =
  typeof window !== "undefined" && Boolean((window as any).ReactNativeWebView);

type Waiting = { resolve: (value: any) => void; reject: (error: Error) => void };

const waiting = new Map<number, Waiting>();
const handlers = new Map<string, (data: any) => void>();
let nextId = 1;

if (IN_NATIVE_SHELL) {
  window.addEventListener("message", (event: MessageEvent) => {
    let data = event.data;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        return;
      }
    }
    if (!data?.type) return;
    if (data.type === "reply") {
      const reply = waiting.get(data.id);
      if (!reply) return;
      waiting.delete(data.id);
      if (data.error) reply.reject(new Error(data.error));
      else reply.resolve(data.result);
      return;
    }
    handlers.get(data.type)?.(data);
  });
}

export function tellNative(type: string, payload: Record<string, unknown> = {}): void {
  (window as any).ReactNativeWebView.postMessage(JSON.stringify({ type, ...payload }));
}

// Asks the phone side to do something and waits for its answer
export function askNative<T = void>(type: string, payload: Record<string, unknown> = {}): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    tellNative(type, { ...payload, id });
  });
}

// Runs `handler` whenever the phone side sends news of this type
export function onNative(type: string, handler: (data: any) => void): void {
  handlers.set(type, handler);
}

import type { AlertButton } from "react-native";
import { theme } from "@/constants/theme";

// Asks the listener to pick one of a few actions in a small browser dialog. A Cancel button
// closes it; one is added when the buttons have none
export function askChoice(title: string, message: string | undefined, buttons: AlertButton[]): void {
  const dialog = document.createElement("dialog");
  dialog.style.cssText = `background:${theme.colors.surfaceElevated};color:${theme.colors.textPrimary};border:1px solid ${theme.colors.surfaceGlassBorder};border-radius:${theme.radius.lg}px;padding:20px;min-width:260px;max-width:360px;font-family:${theme.fonts.sans},sans-serif;`;

  const heading = document.createElement("p");
  heading.textContent = title;
  heading.style.cssText = "margin:0 0 4px;font-weight:700;font-size:16px;";
  dialog.append(heading);
  if (message) {
    const hint = document.createElement("p");
    hint.textContent = message;
    hint.style.cssText = `margin:0 0 16px;font-size:13px;color:${theme.colors.textSecondary};`;
    dialog.append(hint);
  }

  const withCancel = buttons.some((b) => b.style === "cancel")
    ? buttons
    : [...buttons, { text: "Cancel", style: "cancel" as const }];
  for (const b of withCancel) {
    const primary = b.style !== "cancel";
    const color = b.style === "destructive" ? theme.colors.danger : primary ? theme.colors.playButtonIcon : theme.colors.textSecondary;
    const background = b.style === "destructive" ? "transparent" : primary ? theme.colors.primary : "transparent";
    const el = document.createElement("button");
    el.textContent = b.text ?? "";
    el.style.cssText = `display:block;width:100%;margin-top:8px;padding:12px;border-radius:${theme.radius.md}px;font-weight:700;font-size:14px;cursor:pointer;border:1px solid ${b.style === "destructive" ? color : theme.colors.surfaceGlassBorder};background:${background};color:${color};`;
    el.onclick = () => {
      dialog.close();
      b.onPress?.();
    };
    dialog.append(el);
  }

  dialog.addEventListener("close", () => dialog.remove());
  document.body.appendChild(dialog);
  dialog.showModal();
}

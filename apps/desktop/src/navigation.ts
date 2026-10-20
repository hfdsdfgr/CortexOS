import { useMemo, useSyncExternalStore } from "react";
export type PageName = "chat" | "knowledge" | "graph" | "settings";
const subscribe = (change: () => void) => {
  window.addEventListener("hashchange", change);
  return () => window.removeEventListener("hashchange", change);
};
export function useNavigation() {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return useMemo(() => {
    const [path, query = ""] = hash.replace(/^#\//, "").split("?");
    const params = new URLSearchParams(query);
    const page: PageName = ["chat", "knowledge", "graph", "settings"].includes(
      path,
    )
      ? (path as PageName)
      : "chat";
    const number = Number(params.get("version"));
    return {
      page,
      hash,
      workspace: params.get("workspace"),
      conversation: params.get("conversation"),
      run: params.get("run"),
      node: params.get("node"),
      event: params.get("event"),
      message: params.get("message"),
      version: Number.isSafeInteger(number) && number > 0 ? number : undefined,
      mode: params.get("mode") === "execution" ? "execution" : "knowledge",
      back: /^(#\/graph\?|#\/chat\?)/.test(params.get("back") ?? "")
        ? params.get("back")
        : null,
    };
  }, [hash]);
}
export function navigate(
  page: PageName,
  values: Record<string, string | number | null | undefined> = {},
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== null && value !== undefined) params.set(key, String(value));
  window.location.hash = `/${page}${params.size ? `?${params}` : ""}`;
}

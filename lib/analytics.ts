/**
 * GA4 イベント送信
 * レイアウトで読み込んだ gtag を使用（window.gtag）
 */

export type CtaLocation = "hero" | "nav_desktop" | "nav_mobile";

export function trackCtaClick(location: CtaLocation): void {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void })
    .gtag;
  if (typeof gtag !== "function") return;
  gtag("event", "cta_click", {
    event_category: "engagement",
    event_label: "google_start",
    button_location: location,
  });
}

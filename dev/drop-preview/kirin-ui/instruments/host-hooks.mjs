// Host-only adapters: no product hooks, global listeners, storage or engine imports.
export function useStoneLightContext() {
  const style = getComputedStyle(document.body);
  return { vars: { '--sx': style.getPropertyValue('--sx'), '--sy': style.getPropertyValue('--sy') } };
}
export function useTranslation() {
  return { t: (key, values = {}) => key.replace(/\{\{(\w+)\}\}/g, (_, name) => values[name] ?? '') };
}

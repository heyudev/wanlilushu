// One shared loader for the AMap JS API 2.0; extra plugins are loaded on demand.
/* eslint-disable @typescript-eslint/no-explicit-any */
import AMapLoader from "@amap/amap-jsapi-loader";

const KEY = import.meta.env.VITE_AMAP_JS_KEY as string | undefined;
const SECURITY = import.meta.env.VITE_AMAP_JS_SECURITY_CODE as string | undefined;
export const AMAP_ENABLED = Boolean(KEY);

let base: Promise<any> | null = null;

export function loadAMap(plugins: string[] = []): Promise<any> {
  if (!base) {
    (window as any)._AMapSecurityConfig = { securityJsCode: SECURITY ?? "" };
    base = AMapLoader.load({ key: KEY!, version: "2.0", plugins: ["AMap.Scale", "AMap.ToolBar"] });
  }
  if (!plugins.length) return base;
  return base.then((AMap) => new Promise((resolve) => AMap.plugin(plugins, () => resolve(AMap))));
}

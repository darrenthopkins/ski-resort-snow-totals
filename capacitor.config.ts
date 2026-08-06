import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.dhopkins.skiresortsnowtotals",
  appName: "lift",
  webDir: "dist",
  ios: {
    webContentsDebuggingEnabled: true,
  },
};

export default config;

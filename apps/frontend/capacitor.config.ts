import { networkInterfaces } from "node:os";
import type { CapacitorConfig } from "@capacitor/cli";

function localIP() {
  for (const iface of Object.values(networkInterfaces()).flat()) {
    if (iface?.family === "IPv4" && !iface.internal) return iface.address;
  }
  return "localhost";
}

const liveReload = process.env.CAPACITOR_LIVE_RELOAD === "true";

const config: CapacitorConfig = {
  appId: "com.elumixor.balance",
  appName: "Balance",
  webDir: "build",
  server: liveReload ? { url: `http://${localIP()}:8081`, cleartext: true } : { androidScheme: "https" },
};

export default config;

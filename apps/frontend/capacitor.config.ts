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
  server: liveReload
    ? { url: `http://${localIP()}:8081`, cleartext: true }
    : {
        // Serve the bundled app from `https://localhost` rather than Capacitor's default
        // `capacitor://localhost`. Clerk refuses to authenticate a browser on a scheme it
        // doesn't recognise ("Unable to authenticate this browser for your development
        // instance"), and a real secure origin also gives the webview normal storage rules.
        iosScheme: "https",
        hostname: "localhost",
        androidScheme: "https",
      },
  plugins: {
    SocialLogin: {
      google: {
        iOSClientId: "836194369955-5vudcjgcu637ma5bje6idu96emjm0f1a.apps.googleusercontent.com",
        mode: "online",
      },
    },
  },
};

export default config;

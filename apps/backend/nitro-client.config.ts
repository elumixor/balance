export default {
  src: "server",
  out: "../frontend/src/lib/api-client",
  tsconfig: "tsconfig.json",
  // `/download/*` is a redirect into the blob store the macOS build is published to, not part of
  // the API the app is typed against — and a catch-all segment has no shape a client can name.
  excludeDirs: "download",
};

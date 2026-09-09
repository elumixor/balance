export default {
  src: "server",
  out: "../frontend/src/lib/api-client",
  tsconfig: "tsconfig.json",
  // `/download/*` is a redirect into the blob store the macOS build is published to, not part of
  // the API the app is typed against — and a catch-all segment has no shape a client can name.
  excludeDirs: "download",
  // `/mcp` is JSON-RPC spoken to an assistant, not a route the app calls — and its one shape is
  // "whatever the protocol said", which a typed client has nothing to do with. By path rather than
  // by folder: `/mobile/mcp/keys` is an ordinary route, and a folder rule would take it too.
  excludeRoutes: "/mcp",
};

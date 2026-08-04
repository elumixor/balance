/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "watch",
  name: "Balance Watch App",
  displayName: "Balance",
  bundleIdentifier: ".watchkitapp",
  deploymentTarget: "10.0",
  // Drives ASSETCATALOG_COMPILER_APPICON_NAME, without which the generated
  // Info.plist has no CFBundleIconName and App Store upload rejects the bundle.
  icon: "../../assets/icon.png",
};

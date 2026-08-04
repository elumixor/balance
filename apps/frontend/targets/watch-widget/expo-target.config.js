/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "watch-widget",
  name: "Balance Watch Widget Extension",
  displayName: "Balance",
  bundleIdentifier: ".watchkitapp.widget",
  deploymentTarget: "10.0",
  frameworks: ["WidgetKit", "SwiftUI"],
};

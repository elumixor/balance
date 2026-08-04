const path = require("path");
const {
  withXcodeProjectBeta,
} = require("@bacons/apple-targets/build/with-bacons-xcode");
const {
  XCLocalSwiftPackageReference,
  XCSwiftPackageProductDependency,
  PBXBuildFile,
} = require("@bacons/xcode");

// BalanceKit is a local Swift package (apple/BalanceKit) that isn't part of the Expo
// `targets/` tree (@bacons/apple-targets has no config field for local SPM dependencies).
// It's linked into the watch app + widget targets here, directly against the generated
// Xcode project, via @bacons/xcode's low-level package-reference primitives. BalanceKit's
// own Package.swift depends on the external `clerk-ios` package (product `ClerkKit`) — the
// watch app's ContentView/BalanceWatchApp genuinely import ClerkKit for Clerk's
// WatchConnectivity session sync, so that product is linked too. The widget only needs
// the `BalanceKit` product (API client / models / shared state), not Clerk.
//
// IMPORTANT: this plugin must be listed BEFORE "@bacons/apple-targets" in app.json's
// `plugins` array. Both hook the same custom "ios.xcodeProjectBeta2" mod that
// @bacons/apple-targets defines; @bacons/apple-targets registers the terminal
// read/write "provider" for that mod (which must always be the *last* registration,
// see with-bacons-xcode.js), and consumer actions registered *before* the provider run
// in reverse order — last-registered consumer runs first. So listing this plugin before
// @bacons/apple-targets means apple-targets' own target-creation actions (registered
// after this one) execute first, and by the time this plugin's action runs, the watch
// app + widget targets already exist in the project.
const WATCH_APP_TARGET_NAME = "Balance Watch App";
const WATCH_WIDGET_TARGET_NAME = "Balance Watch Widget Extension";

module.exports = function withBalanceKitSwiftPackage(config) {
  return withXcodeProjectBeta(config, (modConfig) => {
    const project = modConfig.modResults;
    const xcodeprojDir = project.getProjectRoot();
    const balanceKitPath = path.resolve(
      modConfig.modRequest.projectRoot,
      "../../apple/BalanceKit",
    );
    const relativePath = path.relative(xcodeprojDir, balanceKitPath);

    let packageRef = [...project.values()].find(
      (obj) =>
        XCLocalSwiftPackageReference.is(obj) &&
        obj.props.relativePath === relativePath,
    );
    if (!packageRef) {
      packageRef = XCLocalSwiftPackageReference.create(project, {
        relativePath,
      });
      project.rootObject.props.packageReferences ??= [];
      project.rootObject.props.packageReferences.push(packageRef);
    }

    function linkProduct(target, productName) {
      let productDependency = (
        target.props.packageProductDependencies ?? []
      ).find((dep) => dep.props.productName === productName);
      if (!productDependency) {
        productDependency = XCSwiftPackageProductDependency.create(project, {
          package: packageRef,
          productName,
        });
        target.props.packageProductDependencies ??= [];
        target.props.packageProductDependencies.push(productDependency);
      }
      const framework = target.getFrameworksBuildPhase();
      const alreadyLinked = framework.props.files.some(
        (file) => file.props.productRef?.uuid === productDependency.uuid,
      );
      if (!alreadyLinked) {
        const buildFile = PBXBuildFile.create(project, {
          productRef: productDependency,
        });
        framework.props.files.push(buildFile);
      }
    }

    const allTargets = project.rootObject.props.targets ?? [];
    const watchAppTarget = allTargets.find(
      (t) => t.props.name === WATCH_APP_TARGET_NAME,
    );
    const watchWidgetTarget = allTargets.find(
      (t) => t.props.name === WATCH_WIDGET_TARGET_NAME,
    );

    if (!watchAppTarget || !watchWidgetTarget) {
      throw new Error(
        `[withBalanceKitSwiftPackage] Could not find expected targets in the generated Xcode project ` +
          `(watchApp=${!!watchAppTarget}, watchWidget=${!!watchWidgetTarget}). ` +
          `Check that the @bacons/apple-targets "name" fields still match ${JSON.stringify(
            [WATCH_APP_TARGET_NAME, WATCH_WIDGET_TARGET_NAME],
          )}, and that this plugin is listed BEFORE "@bacons/apple-targets" in app.json.`,
      );
    }

    linkProduct(watchAppTarget, "BalanceKit");
    linkProduct(watchAppTarget, "ClerkKit");
    linkProduct(watchWidgetTarget, "BalanceKit");

    return modConfig;
  });
};

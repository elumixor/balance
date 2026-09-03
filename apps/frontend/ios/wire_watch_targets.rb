#!/usr/bin/env ruby
# frozen_string_literal: true

# Adds the watchOS app + widget extension targets to App.xcodeproj and wires sources, resources,
# Info.plists, signing, the BalanceKit package, dependencies and the embed (copy-files) build
# phases. Idempotent: re-running removes and recreates the two targets cleanly.
#
# `npx cap add ios` only knows about the single iOS host target, so anything else on the Apple
# side is added here. The resulting project is committed — this does not run during a build.
#
#   cd apps/frontend/ios && ruby wire_watch_targets.rb
require "xcodeproj"

PROJ = File.expand_path("App/App.xcodeproj", __dir__)
TEAM = "464K6UHCU4"
APP_TARGET = "App"
WATCH_NAME = "BalanceWatch"
WIDGET_NAME = "BalanceWatchWidget"
APP_BUNDLE = "com.elumixor.balance"
WATCH_BUNDLE = "#{APP_BUNDLE}.watchkitapp"
WIDGET_BUNDLE = "#{WATCH_BUNDLE}.widget"
DEPLOYMENT_TARGET = "10.0"

project = Xcodeproj::Project.open(PROJ)
app_target = project.targets.find { |t| t.name == APP_TARGET }
raise "App target not found" unless app_target

# Signing is by team for every target; `cap add ios` leaves the host target without one.
app_target.build_configurations.each { |c| c.build_settings["DEVELOPMENT_TEAM"] = TEAM }

# The phone app's own watch-facing code. Capacitor generated the App target and knows nothing
# about anything added to it since, so the file is named here — the plugin that carries a sign-in
# ticket to the watch is the phone half of the watch app working at all.
app_group = project.main_group.children.find { |c| c.display_name == APP_TARGET }
HOST_SOURCES = ["WatchHandoffPlugin.swift", "IcsImportPlugin.swift", "HealthKitPlugin.swift"].freeze
HOST_SOURCES.each do |name|
  next if app_target.source_build_phase.files.any? { |f| f.file_ref&.display_name == name }

  reference = app_group&.files&.find { |f| f.display_name == name } ||
              app_group&.new_reference(File.expand_path("App/App/#{name}", __dir__))
  app_target.add_file_references([reference]) if reference
end

# --- clean previous runs -----------------------------------------------------
[WATCH_NAME, WIDGET_NAME].each do |name|
  next unless (target = project.targets.find { |t| t.name == name })

  project.targets.each do |other|
    other.dependencies.dup.each { |d| d.remove_from_project if d.target == target }
    other.build_phases.grep(Xcodeproj::Project::Object::PBXCopyFilesBuildPhase).each do |phase|
      phase.files.dup.each { |bf| bf.remove_from_project if bf.file_ref == target.product_reference }
    end
  end
  target.product_reference&.remove_from_project
  target.remove_from_project
end
[WATCH_NAME, WIDGET_NAME].each do |name|
  project.main_group.children.find { |c| c.display_name == name }&.remove_from_project
end

src_root = File.expand_path("App", __dir__)

def add_settings(target, settings)
  target.build_configurations.each do |config|
    settings.each { |key, value| config.build_settings[key] = value }
    config.build_settings["CODE_SIGN_STYLE"] = config.name == "Release" ? "Manual" : "Automatic"
  end
end

COMMON = {
  "SDKROOT" => "watchos",
  "WATCHOS_DEPLOYMENT_TARGET" => DEPLOYMENT_TARGET,
  "TARGETED_DEVICE_FAMILY" => "4",
  "PRODUCT_NAME" => "$(TARGET_NAME)",
  "SWIFT_VERSION" => "5.0",
  "DEVELOPMENT_TEAM" => TEAM,
  # The plists below are complete, including the version keys the release lane rewrites.
  "GENERATE_INFOPLIST_FILE" => "NO",
  "CURRENT_PROJECT_VERSION" => "1",
}.freeze

# BalanceKit is a local Swift package next to this project, shared by the watch app and the
# widget. The watch app also links ClerkKit directly, for the WatchConnectivity session sync
# its root view reads.
package_ref = project.root_object.package_references.find do |ref|
  ref.is_a?(Xcodeproj::Project::Object::XCLocalSwiftPackageReference) && ref.relative_path == "../BalanceKit"
end
unless package_ref
  package_ref = project.new(Xcodeproj::Project::Object::XCLocalSwiftPackageReference)
  package_ref.relative_path = "../BalanceKit"
  project.root_object.package_references << package_ref
end

def link_package_product(project, target, package_ref, product_name)
  dependency = project.new(Xcodeproj::Project::Object::XCSwiftPackageProductDependency)
  dependency.package = package_ref
  dependency.product_name = product_name
  target.package_product_dependencies << dependency

  build_file = project.new(Xcodeproj::Project::Object::PBXBuildFile)
  build_file.product_ref = dependency
  target.frameworks_build_phase.files << build_file
end

# The same, for a target this script doesn't rebuild from scratch on every run — the host app.
def ensure_package_product(project, target, package_ref, product_name)
  return if target.package_product_dependencies.any? { |d| d.product_name == product_name }

  link_package_product(project, target, package_ref, product_name)
end

# The phone app reports its own crashes: the Swift shell runs before there is a webview to report
# into, and `IcsImportPlugin` and `WatchHandoffPlugin` are native code the web app never sees fail.
# `BalanceTelemetry` only, not `BalanceKit` — the rest of that package is Clerk's native SDK, and
# this app's sign-in lives in the webview.
ensure_package_product(project, app_target, package_ref, "BalanceTelemetry")

# ---------------------------------------------------------------------------
# Widget extension (watchOS)
# ---------------------------------------------------------------------------
widget = project.new_target(:app_extension, WIDGET_NAME, :watchos, DEPLOYMENT_TARGET, nil, :swift)
widget_group = project.main_group.new_group(WIDGET_NAME, "App/WatchWidget")
widget.add_file_references(
  Dir[File.join(src_root, "WatchWidget/*.swift")].sort.map { |f| widget_group.new_reference(f) },
)
# The entitlements are not compiled, but keeping them visible in the group is how anyone opening
# the project finds out the widget reads a shared container.
widget_group.new_reference(File.join(src_root, "WatchWidget/#{WIDGET_NAME}.entitlements"))
link_package_product(project, widget, package_ref, "BalanceKit")

add_settings(widget, COMMON.merge(
  "PRODUCT_BUNDLE_IDENTIFIER" => WIDGET_BUNDLE,
  "INFOPLIST_FILE" => "WatchWidget/Info.plist",
  # The widget renders from the App Group blob the watch app writes, so both ends need the group.
  "CODE_SIGN_ENTITLEMENTS" => "WatchWidget/#{WIDGET_NAME}.entitlements",
  "SKIP_INSTALL" => "YES",
  "LD_RUNPATH_SEARCH_PATHS" => "$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks",
))

# ---------------------------------------------------------------------------
# Watch app (watchOS, modern single-target SwiftUI app)
# ---------------------------------------------------------------------------
watch = project.new_target(:application, WATCH_NAME, :watchos, DEPLOYMENT_TARGET, nil, :swift)
watch_group = project.main_group.new_group(WATCH_NAME, "App/WatchApp")
watch.add_file_references(
  Dir[File.join(src_root, "WatchApp/*.swift")].sort.map { |f| watch_group.new_reference(f) },
)
watch.add_resources([watch_group.new_reference(File.join(src_root, "WatchApp/Assets.xcassets"))])
watch_group.new_reference(File.join(src_root, "WatchApp/#{WATCH_NAME}.entitlements"))
link_package_product(project, watch, package_ref, "BalanceKit")
link_package_product(project, watch, package_ref, "BalanceTelemetry")
link_package_product(project, watch, package_ref, "ClerkKit")

add_settings(watch, COMMON.merge(
  "PRODUCT_BUNDLE_IDENTIFIER" => WATCH_BUNDLE,
  "INFOPLIST_FILE" => "WatchApp/Info.plist",
  # The App Group is the widget's only source of data, and it is an entitlement rather than a plist
  # key. A fixed session's alarm is a plain local notification: marking it time-sensitive would buy
  # only the right to interrupt a Focus, at the cost of one more capability to provision.
  "CODE_SIGN_ENTITLEMENTS" => "WatchApp/#{WATCH_NAME}.entitlements",
  "SKIP_INSTALL" => "NO",
  # Without CFBundleIconName the App Store rejects the upload, and that key comes from here.
  "ASSETCATALOG_COMPILER_APPICON_NAME" => "AppIcon",
  "LD_RUNPATH_SEARCH_PATHS" => "$(inherited) @executable_path/Frameworks",
  "ENABLE_PREVIEWS" => "YES",
))

# --- widget embedded into the watch app (PlugIns) ---------------------------
watch.add_dependency(widget)
embed_ext = watch.new_copy_files_build_phase("Embed Foundation Extensions")
embed_ext.symbol_dst_subfolder_spec = :plug_ins
embed_ext.add_file_reference(widget.product_reference, true).settings = { "ATTRIBUTES" => ["RemoveHeadersOnCopy"] }

# --- watch app embedded into the iOS app (Watch content) --------------------
app_target.add_dependency(watch)
embed_watch = app_target.new_copy_files_build_phase("Embed Watch Content")
embed_watch.symbol_dst_subfolder_spec = :products_directory
embed_watch.dst_path = "$(CONTENTS_FOLDER_PATH)/Watch"
embed_watch.add_file_reference(watch.product_reference, true).settings = { "ATTRIBUTES" => ["RemoveHeadersOnCopy"] }

project.save

# --- schemes ----------------------------------------------------------------
# Without shared schemes, Xcode invents one per target, and the invented scheme for an app
# extension also builds the extension's containing app — which here means building the Capacitor
# iOS app for watchOS, something it can never do. These build exactly one target each.
#
# The host app is shared here too, and has to be: the moment this project holds any shared scheme
# at all, Xcode stops inventing the rest, and a release build that asks for the `App` scheme by
# name — which is what fastlane's `beta` lane does — finds nothing.
[[APP_TARGET, app_target], [WATCH_NAME, watch], [WIDGET_NAME, widget]].each do |name, target|
  scheme = Xcodeproj::XCScheme.new
  scheme.add_build_target(target)
  scheme.set_launch_target(target) unless target == widget
  scheme.save_as(PROJ, name, true)
end

puts "Wired #{WATCH_NAME} + #{WIDGET_NAME} into #{File.basename(PROJ)}"
project.targets.each { |t| puts "  target: #{t.name} (#{t.product_type})" }

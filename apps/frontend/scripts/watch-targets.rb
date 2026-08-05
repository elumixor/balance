#!/usr/bin/env ruby
# frozen_string_literal: true

# Adds the watchOS app and its widget extension to the Capacitor-generated Xcode project.
#
# `npx cap add ios` only ever produces the single iOS host target, and Capacitor has no notion of
# extra Apple targets, so the watch side is wired in here instead. The script is idempotent — it
# drops any targets it previously created and rebuilds them — so it can be re-run after Capacitor
# regenerates or updates the project. The resulting project is committed, exactly like the rest of
# `ios/`; nothing needs to run this during a normal build.
#
#   cd apps/frontend && ruby scripts/watch-targets.rb

require "xcodeproj"
require "fileutils"

FRONTEND = File.expand_path("..", __dir__)
ROOT = File.expand_path("../..", FRONTEND)
PROJECT_PATH = File.join(FRONTEND, "ios/App/App.xcodeproj")

APP_TARGET = "App"
WATCH_TARGET = "Balance Watch App"
WIDGET_TARGET = "Balance Watch Widget Extension"

APP_ID = "com.elumixor.balance"
WATCH_ID = "#{APP_ID}.watchkitapp"
WIDGET_ID = "#{WATCH_ID}.widget"
APP_GROUP = "group.#{APP_ID}"
TEAM_ID = "464K6UHCU4"
WATCHOS_DEPLOYMENT_TARGET = "10.0"

project = Xcodeproj::Project.open(PROJECT_PATH)
app_target = project.targets.find { |t| t.name == APP_TARGET } or raise "No #{APP_TARGET} target"

# Signing is by team for every target; `cap add ios` leaves the host target without one.
app_target.build_configurations.each { |config| config.build_settings["DEVELOPMENT_TEAM"] = TEAM_ID }

# Project-level version defaults, so the watch targets have something to stamp their generated
# Info.plists with. The release lane overwrites all three targets before it archives.
project.build_configurations.each do |config|
  config.build_settings["MARKETING_VERSION"] ||= "1.0"
  config.build_settings["CURRENT_PROJECT_VERSION"] ||= "1"
end

# ── Clean slate ────────────────────────────────────────────────────────────────
# Recreating is simpler than diffing, and keeps a re-run from stacking duplicate
# build phases onto the host target.
[WATCH_TARGET, WIDGET_TARGET].each do |name|
  target = project.targets.find { |t| t.name == name }
  next unless target

  app_target.dependencies.select { |d| d.target == target }.each(&:remove_from_project)
  target.remove_from_project
end
project.main_group.children.select { |g| ["Watch", "Watch Widget"].include?(g.display_name) }.each(&:remove_from_project)
app_target.build_phases.select { |p| p.respond_to?(:name) && p.name == "Embed Watch Content" }.each(&:remove_from_project)

# ── Entitlements ───────────────────────────────────────────────────────────────
# The watch app writes the running-timer snapshot the widget reads, through a shared
# App Group container (see BalanceKit's WatchSharedState).
def write_entitlements(path)
  FileUtils.mkdir_p(File.dirname(path))
  File.write(path, <<~PLIST)
    <?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
    <plist version="1.0">
    <dict>
    \t<key>com.apple.security.application-groups</key>
    \t<array>
    \t\t<string>#{APP_GROUP}</string>
    \t</array>
    </dict>
    </plist>
  PLIST
end

write_entitlements(File.join(FRONTEND, "watch/App/Watch.entitlements"))
write_entitlements(File.join(FRONTEND, "watch/Widget/Widget.entitlements"))

# ── Targets ────────────────────────────────────────────────────────────────────
watch_target = project.new_target(:application, WATCH_TARGET, :watchos, WATCHOS_DEPLOYMENT_TARGET)
widget_target = project.new_target(:app_extension, WIDGET_TARGET, :watchos, WATCHOS_DEPLOYMENT_TARGET)

COMMON_SETTINGS = {
  "DEVELOPMENT_TEAM" => TEAM_ID,
  "SWIFT_VERSION" => "5.0",
  "TARGETED_DEVICE_FAMILY" => "4",
  "WATCHOS_DEPLOYMENT_TARGET" => WATCHOS_DEPLOYMENT_TARGET,
  "SDKROOT" => "watchos",
  "SUPPORTED_PLATFORMS" => "watchos watchsimulator",
  # Merges the INFOPLIST_KEY_* settings below into the checked-in plist, so each plist only
  # has to carry the handful of keys Xcode can't synthesise.
  "GENERATE_INFOPLIST_FILE" => "YES",
  "SKIP_INSTALL" => "NO",
}.freeze

watch_target.build_configurations.each do |config|
  config.build_settings.merge!(COMMON_SETTINGS)
  config.build_settings.merge!(
    "PRODUCT_BUNDLE_IDENTIFIER" => WATCH_ID,
    "PRODUCT_NAME" => "Balance",
    "INFOPLIST_FILE" => "../../watch/App/Info.plist",
    "CODE_SIGN_ENTITLEMENTS" => "../../watch/App/Watch.entitlements",
    # Without CFBundleIconName the App Store rejects the upload, and that key comes from here.
    "ASSETCATALOG_COMPILER_APPICON_NAME" => "AppIcon",
    "INFOPLIST_KEY_CFBundleDisplayName" => "Balance",
    "INFOPLIST_KEY_WKApplication" => "YES",
    "INFOPLIST_KEY_WKCompanionAppBundleIdentifier" => APP_ID,
    "INFOPLIST_KEY_WKRunsIndependentlyOfCompanionApp" => "YES",
  )
end

widget_target.build_configurations.each do |config|
  config.build_settings.merge!(COMMON_SETTINGS)
  config.build_settings.merge!(
    "PRODUCT_BUNDLE_IDENTIFIER" => WIDGET_ID,
    "PRODUCT_NAME" => "$(TARGET_NAME)",
    "INFOPLIST_FILE" => "../../watch/Widget/Info.plist",
    "CODE_SIGN_ENTITLEMENTS" => "../../watch/Widget/Widget.entitlements",
    "INFOPLIST_KEY_CFBundleDisplayName" => "Balance",
  )
end

# ── Sources and resources ──────────────────────────────────────────────────────
def add_group(project, name, path)
  project.main_group.new_group(name, path, :group)
end

watch_group = add_group(project, "Watch", "../../watch/App")
widget_group = add_group(project, "Watch Widget", "../../watch/Widget")

def add_swift_sources(group, dir, target)
  Dir[File.join(dir, "*.swift")].sort.each do |file|
    target.add_file_references([group.new_reference(File.basename(file))])
  end
end

add_swift_sources(watch_group, File.join(FRONTEND, "watch/App"), watch_target)
add_swift_sources(widget_group, File.join(FRONTEND, "watch/Widget"), widget_target)

assets = watch_group.new_reference("Assets.xcassets")
watch_target.add_resources([assets])

# ── BalanceKit ─────────────────────────────────────────────────────────────────
# A local Swift package under `apple/`, shared by the watch app and the widget. The watch app
# also links ClerkKit directly, for the WatchConnectivity session sync its root view reads.
package_path = Pathname.new(File.join(ROOT, "apple/BalanceKit"))
relative_package_path = package_path.relative_path_from(Pathname.new(File.dirname(PROJECT_PATH))).to_s

package_ref = project.root_object.package_references.find do |ref|
  ref.is_a?(Xcodeproj::Project::Object::XCLocalSwiftPackageReference) && ref.relative_path == relative_package_path
end
unless package_ref
  package_ref = project.new(Xcodeproj::Project::Object::XCLocalSwiftPackageReference)
  package_ref.relative_path = relative_package_path
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

link_package_product(project, watch_target, package_ref, "BalanceKit")
link_package_product(project, watch_target, package_ref, "ClerkKit")
link_package_product(project, widget_target, package_ref, "BalanceKit")

# ── Embedding ──────────────────────────────────────────────────────────────────
# The widget rides inside the watch app, and the watch app rides inside the iOS app.
widget_embed = watch_target.new_copy_files_build_phase("Embed Foundation Extensions")
widget_embed.symbol_dst_subfolder_spec = :plug_ins
widget_embed.add_file_reference(widget_target.product_reference).settings = { "ATTRIBUTES" => ["RemoveHeadersOnCopy"] }
watch_target.add_dependency(widget_target)

watch_embed = app_target.new_copy_files_build_phase("Embed Watch Content")
watch_embed.symbol_dst_subfolder_spec = :products_directory
watch_embed.dst_path = "$(CONTENTS_FOLDER_PATH)/Watch"
watch_embed.add_file_reference(watch_target.product_reference).settings = { "ATTRIBUTES" => ["RemoveHeadersOnCopy"] }
app_target.add_dependency(watch_target)

project.save
puts "Wired #{WATCH_TARGET} and #{WIDGET_TARGET} into #{File.basename(PROJECT_PATH)}"

#!/usr/bin/env ruby
# frozen_string_literal: true

# Adds DailyIconManager.swift to the App target and registers the 31 AppIcon-DayNN.appiconset
# alternate icons `npx cap add ios` and `bun run scripts/daily-icons.ts` don't know how to declare.
#
# The alternates live in the asset catalog, not as loose PNGs: App Store validation wants every
# icon present at 120x120 (iPhone) and 152x152 / 167x167 (iPad), which only the compiled catalog
# produces. Naming them in ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES is what makes Xcode
# compile them and write the matching CFBundleIcons entries into the built Info.plist.
#
# Idempotent: re-running just rewrites the setting from whatever sets are on disk.
#
#   cd apps/frontend/ios && ruby wire_daily_icons.rb
require "xcodeproj"

PROJ = File.expand_path("App/App.xcodeproj", __dir__)
APP_TARGET = "App"
CATALOG = File.expand_path("App/App/Assets.xcassets", __dir__)

project = Xcodeproj::Project.open(PROJ)
app_target = project.targets.find { |t| t.name == APP_TARGET }
raise "App target not found" unless app_target

app_group = project.main_group["App"]
raise "App group not found" unless app_group

# The icons used to ship as loose PNGs in an AlternateIcons group; drop it if it's still around.
app_group["AlternateIcons"]&.remove_from_project

names = Dir.glob("#{CATALOG}/AppIcon-Day*.appiconset").map { |p| File.basename(p, ".appiconset") }.sort
raise "no alternate icon sets found — run scripts/daily-icons.ts first" if names.empty?

app_target.build_configurations.each do |config|
  config.build_settings["ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES"] = names
end

swift_ref = app_group["DailyIconManager.swift"]
unless swift_ref
  swift_ref = app_group.new_reference("DailyIconManager.swift")
  app_target.add_file_references([swift_ref])
end

project.save
puts "wired #{names.size} alternate icons + DailyIconManager.swift into #{APP_TARGET}"

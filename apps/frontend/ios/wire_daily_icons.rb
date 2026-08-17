#!/usr/bin/env ruby
# frozen_string_literal: true

# Adds DailyIconManager.swift and the 31 AlternateIcons/*.png files to the App target — sources
# and resources `npx cap add ios` and `bun run scripts/daily-icons.ts` don't know how to register.
# Idempotent: re-running removes and re-adds the group cleanly, so regenerated icons stay in sync.
#
#   cd apps/frontend/ios && ruby wire_daily_icons.rb
require "xcodeproj"

PROJ = File.expand_path("App/App.xcodeproj", __dir__)
APP_TARGET = "App"

project = Xcodeproj::Project.open(PROJ)
app_target = project.targets.find { |t| t.name == APP_TARGET }
raise "App target not found" unless app_target

app_group = project.main_group["App"]
raise "App group not found" unless app_group

app_group["AlternateIcons"]&.remove_from_project

icons_group = app_group.new_group("AlternateIcons", "AlternateIcons")
Dir.glob(File.expand_path("App/App/AlternateIcons/*.png", __dir__)).sort.each do |path|
  ref = icons_group.new_reference(File.basename(path))
  app_target.add_resources([ref])
end

swift_ref = app_group["DailyIconManager.swift"]
unless swift_ref
  swift_ref = app_group.new_reference("DailyIconManager.swift")
  app_target.add_file_references([swift_ref])
end

project.save
puts "wired #{icons_group.children.size} icons + DailyIconManager.swift into #{APP_TARGET}"

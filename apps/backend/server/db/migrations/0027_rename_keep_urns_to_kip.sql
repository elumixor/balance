UPDATE "event_mappings" SET "urn" = replace("urn", 'keep:page/', 'kip:page/') WHERE "urn" LIKE 'keep:page/%';

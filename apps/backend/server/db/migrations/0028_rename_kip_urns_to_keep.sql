UPDATE "event_mappings" SET "urn" = replace("urn", 'kip:page/', 'keep:page/') WHERE "urn" LIKE 'kip:page/%';

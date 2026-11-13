UPDATE "event_mappings" SET "urn" = 'https://keep.desk.atmagaming.com/p/' || substring("urn" from 11) WHERE "urn" LIKE 'keep:page/%';

-- Keep old amount-based drafts explicit before changing future service units.
-- Historical receipts and returns retain their original snapshots.
UPDATE terminal_drafts
SET draft_json = json_set(draft_json, '$.lines', json((
  SELECT json_group_array(json(CASE
    WHEN json_extract(item.value, '$.productId') IN (
      SELECT id FROM custom_products WHERE unit = 'BDT' AND (kind = 'service' OR id = 'service-custom')
    ) OR json_extract(item.value, '$.productId') = 'service-custom'
    THEN json_set(item.value, '$.legacyAmount', json('true'))
    ELSE item.value END))
  FROM json_each(terminal_drafts.draft_json, '$.lines') AS item
)))
WHERE json_valid(draft_json) AND json_type(draft_json, '$.lines') = 'array'
  AND EXISTS (
    SELECT 1 FROM json_each(terminal_drafts.draft_json, '$.lines') AS item
    WHERE json_extract(item.value, '$.productId') IN (
      SELECT id FROM custom_products WHERE unit = 'BDT' AND (kind = 'service' OR id = 'service-custom')
    ) OR json_extract(item.value, '$.productId') = 'service-custom'
  );

UPDATE custom_products SET unit = 'Unit', art = 'cleaner'
WHERE unit = 'BDT' AND (kind = 'service' OR id = 'service-custom');
UPDATE custom_products SET art = 'cleaner' WHERE art = 'recharge';

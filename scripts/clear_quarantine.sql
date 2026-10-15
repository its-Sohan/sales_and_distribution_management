-- Clear accounting quarantine and verify opening inventory book values
DELETE FROM accounting_quarantine WHERE table_name = 'custom_products' AND record_id IN ('mouse-opt', 'mouse-wireless', 'pendrive-32gb', 'cable-lan', 'ssd-128gb');

UPDATE custom_products SET inventory_value = 9600, valuation_status = 'provided' WHERE id = 'mouse-opt';
UPDATE custom_products SET inventory_value = 9000, valuation_status = 'provided' WHERE id = 'mouse-wireless';
UPDATE custom_products SET inventory_value = 10880, valuation_status = 'provided' WHERE id = 'pendrive-32gb';
UPDATE custom_products SET inventory_value = 2560, valuation_status = 'provided' WHERE id = 'cable-lan';
UPDATE custom_products SET inventory_value = 27140, valuation_status = 'provided' WHERE id = 'ssd-128gb';

UPDATE accounting_checkpoints SET historical_status = 'verified', updated_at = CURRENT_TIMESTAMP WHERE id = 1;

UPDATE app_revision SET revision = revision + 1 WHERE id = 1;

-- Synthetic local D1 fixtures. Run with npm run db:seed:local after migrations.
-- Idempotent: existing catalog edits and financial records are preserved.

INSERT OR IGNORE INTO custom_products (id, code, en, bn, category, unit, price, cost, stock, purchased, group_id, variant_name, variant_name_bn, archived, art, color, detail, detail_bn, kind) VALUES
  ('mouse-opt', '101', 'USB Optical Mouse', '', 'staples', 'pc', 350, 240, 45000, 45000, NULL, NULL, NULL, 0, 'daily', '#e4eaff', '1000 DPI · 1.5m wire', '১০০০ ডিপিআই · তারযুক্ত', NULL),
  ('mouse-wireless', '102', 'Wireless Mouse 2.4GHz', '', 'staples', 'pc', 650, 450, 30000, 30000, NULL, NULL, NULL, 0, 'daily', '#d8e8ed', 'Silent click · Nano receiver', 'সাইলেন্ট ক্লিক · ন্যানো রিসিভার', NULL),
  ('keyboard-usb', '103', 'USB Standard Keyboard', '', 'staples', 'pc', 550, 380, 25000, 25000, 'keyboard', 'Standard', NULL, 0, 'daily', '#f0dce1', 'Bangla + Eng layout · USB', 'বাংলা ও ইংরেজি লেআউট', NULL),
  ('keyboard-rgb', '103W', 'RGB Gaming Keyboard', '', 'staples', 'pc', 1200, 850, 15000, 15000, 'keyboard', 'RGB Backlit', NULL, 0, 'daily', '#fffdfa', 'Backlit membrane · Gaming', 'আরজিবি ব্যাকলিট · গেমিং', NULL),
  ('mousepad', '104', 'Gaming Mouse Pad', '', 'staples', 'pc', 150, 80, 50000, 50000, NULL, NULL, NULL, 0, 'daily', '#e5ebc9', 'Stitched border · Non-slip', 'সেলাই বর্ডার · নন-স্লিপ', NULL),
  ('pendrive-32gb', '105', 'USB Pendrive 32GB', '', 'staples', 'pc', 450, 340, 40000, 40000, NULL, NULL, NULL, 0, 'daily', '#eae0cf', 'USB 3.2 Gen 1 · High speed', 'ইউএসবি ৩.২ হাই-স্পিড', NULL),
  ('pendrive-64gb', '106', 'USB Pendrive 64GB', '', 'staples', 'pc', 650, 500, 35000, 35000, NULL, NULL, NULL, 0, 'daily', '#dee9d8', 'USB 3.2 · Metal casing', 'ইউএসবি ৩.২ মেটাল বডি', NULL),
  ('cable-hdmi', '107', 'HDMI Cable 1.5M 4K', '', 'staples', 'pc', 250, 150, 30000, 30000, NULL, NULL, NULL, 0, 'daily', '#e0e8f0', '4K 60Hz · Braided gold-plated', '৪কে ৬০ হার্টজ · ব্রেইডেড', NULL),
  ('cable-vga', '108', 'VGA Display Cable 1.5M', '', 'staples', 'pc', 200, 120, 25000, 25000, NULL, NULL, NULL, 0, 'daily', '#eae0cf', 'Male to male with dual ferrite', 'মেইল টু মেইল ডিসপ্লে ক্যাবল', NULL),
  ('cable-lan', '109', 'CAT6 LAN Cable 3M', '', 'staples', 'pc', 150, 80, 40000, 40000, NULL, NULL, NULL, 0, 'daily', '#f0d7c6', 'Gigabit ready patch cord', 'গিগাবিট প্রস্তুত প্যাচ কর্ড', NULL),
  ('headphone', '110', 'Headphone with Mic', '', 'staples', 'pc', 850, 600, 20000, 20000, NULL, NULL, NULL, 0, 'daily', '#e8e4d8', 'Adjustable headset · Clear audio', 'মাইক্রোফোন সহ হেডসেট', NULL),
  ('speaker-mini', '111', 'USB Mini Speaker 2.0', '', 'staples', 'pc', 650, 450, 18000, 18000, NULL, NULL, NULL, 0, 'daily', '#e6e5ee', 'Stereo desktop sound', 'স্টেরিও ডেস্কটপ সাউন্ড', NULL),
  ('casing-hdd', '112', '2.5" SATA HDD Enclosure', '', 'staples', 'pc', 550, 380, 22000, 22000, NULL, NULL, NULL, 0, 'daily', '#eaddba', 'USB 3.0 External Casing', 'ইউএসবি ৩.০ এক্সটার্নাল কেস', NULL),
  ('usb-hub', '113', '4-Port USB Hub', '', 'staples', 'pc', 350, 220, 25000, 25000, NULL, NULL, NULL, 0, 'daily', '#e0e8f0', 'High speed USB extension', '৪টি ইউএসবি পোর্ট হাব', NULL),
  ('cleaner-kit', '114', 'Screen Cleaning Kit', '', 'staples', 'pc', 150, 80, 35000, 35000, NULL, NULL, NULL, 0, 'daily', '#d8e8ed', 'Spray + Microfiber cloth', 'স্প্রে ও মাইক্রোফাইবার কাপড়', NULL),

  ('service-windows', '201', 'Windows Setup & Essential Apps', '', 'fresh', 'pc', 500, NULL, 0, 0, NULL, NULL, NULL, 0, 'cleaner', '#d8e8ed', 'OS installation + Drivers + Office', 'নতুন উইন্ডোজ + ড্রাইভার ও অফিস', 'service'),
  ('service-pc-clean', '202', 'Desktop Full Servicing', '', 'fresh', 'pc', 400, NULL, 0, 0, NULL, NULL, NULL, 0, 'cleaner', '#e0e8f0', 'Blower clean + Thermal paste', 'ব্লোয়ার ক্লিনিং ও থার্মাল পেস্ট', 'service'),
  ('service-laptop-clean', '203', 'Laptop Deep Clean & Service', '', 'fresh', 'pc', 800, NULL, 0, 0, NULL, NULL, NULL, 0, 'cleaner', '#e0e8f0', 'Heatsink wash + Overheating fix', 'হিটসিঙ্ক সার্ভিসিং ও ফ্যান ক্লিনিং', 'service'),
  ('service-mobo', '204', 'Motherboard Servicing Charge', '', 'fresh', 'pc', 1000, NULL, 0, 0, NULL, NULL, NULL, 0, 'cleaner', '#d8e8ed', 'Chip level diagnosis & repair', 'মাদারবোর্ড রিপেয়ারিং ও চেকিং', 'service'),
  ('service-display', '205', 'Laptop Display Fitting Service', '', 'fresh', 'pc', 500, NULL, 0, 0, NULL, NULL, NULL, 0, 'cleaner', '#e0e8f0', 'Screen replacement labor charge', 'ডিসপ্লে প্যানেল ফিটিং চার্জ', 'service'),
  ('service-data', '206', 'Data Recovery Service', '', 'fresh', 'pc', 1500, NULL, 0, 0, NULL, NULL, NULL, 0, 'cleaner', '#e0e8f0', 'Corrupted drive data retrieval', 'হার্ডডিস্ক ডাটা পুনরুদ্ধার', 'service'),
  ('service-custom', '207', 'Custom Servicing Bill', '', 'fresh', 'Unit', 1, NULL, 0, 0, NULL, NULL, NULL, 0, 'cleaner', '#e0e8f0', 'Variable repair / labor charge', 'কাস্টম সার্ভিস ও মেরামত চার্জ', 'service'),

  ('ssd-128gb', '301', '128GB SATA III 2.5" SSD', '', 'household', 'pc', 1450, 1180, 25000, 25000, NULL, NULL, NULL, 0, 'daily', '#f1e4ca', '550 MB/s speed · 3 yr warranty', '৫৫০ মেগাবাইট/সে. স্পিড', NULL),
  ('ssd-256gb', '302', '256GB NVMe M.2 SSD', '', 'household', 'pc', 2600, 2150, 20000, 20000, NULL, NULL, NULL, 0, 'daily', '#f2dfce', 'Gen3x4 PCIe · High speed', 'হাই-স্পিড এম.২ এনভিএমই', NULL),
  ('ram-8gb-ddr4', '303', '8GB DDR4 Desktop RAM 3200MHz', '', 'household', 'pc', 2200, 1800, 15000, 15000, NULL, NULL, NULL, 0, 'daily', '#e8e4d8', 'U-DIMM 3200MHz · Lifetime warranty', 'ডেস্কটপ র‍্যাম · লাইফটাইম ওয়ারেন্টি', NULL),
  ('psu-450w', '304', '450W Desktop Power Supply', '', 'household', 'pc', 1600, 1250, 12000, 12000, NULL, NULL, NULL, 0, 'daily', '#d8e8ed', '120mm silent fan · ATX', 'ডেস্কটপ পাওয়ার সাপ্লাই ইউনিট', NULL),
  ('thermal-paste', '305', 'Thermal Paste Syringe 4g', '', 'household', 'pc', 180, 90, 35000, 35000, NULL, NULL, NULL, 0, 'daily', '#f0dce1', 'High performance cooling compound', 'সিপিইউ ও জিপিইউ কুলিং পেস্ট', NULL),
  ('cable-power', '306', 'Desktop Power Cable 3-Pin', '', 'household', 'pc', 150, 80, 40000, 40000, NULL, NULL, NULL, 0, 'daily', '#e4eaff', 'Heavy-duty copper wire 1.5m', 'হেভি-ডিউটি তামার তার ১.৫ মিটার', NULL);

INSERT OR IGNORE INTO custom_customers
  (id, en, bn, phone, address, opening_balance, note) VALUES
  ('local-test-due', 'Demo Credit Customer', 'ডেমো বাকি গ্রাহক', '01700000001', 'Local test fixture', 250, 'Synthetic browser test customer'),
  ('local-test-paid', 'Demo Cash Customer', 'ডেমো নগদ গ্রাহক', '01700000002', 'Local test fixture', 0, 'Synthetic browser test customer');

INSERT OR IGNORE INTO expenses
  (id, created_at, category, amount, method, note) VALUES
  ('local-test-transport', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'transport', 150, 'cash', 'Synthetic delivery expense');

UPDATE app_revision SET revision = revision + 1 WHERE id = 1;

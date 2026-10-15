import type { Product, Customer, ShopState } from "../../src/model"

// Explicit sample records for isolated tests; never imported by production code.
export const products: Product[] = [
  // Computer Accessories (staples)
  { id: 'mouse-opt', code: '101', en: 'USB Optical Mouse', detail: '1000 DPI · 1.5m wire', detailBn: '১০০০ ডিপিআই · তারযুক্ত', category: 'staples', unit: 'pc', price: 350, cost: 240, stock: 45000, purchased: 45000, art: 'daily', color: '#e4eaff' },
  { id: 'mouse-wireless', code: '102', en: 'Wireless Mouse 2.4GHz', detail: 'Silent click · Nano receiver', detailBn: 'সাইলেন্ট ক্লিক · ন্যানো রিসিভার', category: 'staples', unit: 'pc', price: 650, cost: 450, stock: 30000, purchased: 30000, art: 'daily', color: '#d8e8ed' },
  { id: 'keyboard-usb', code: '103', en: 'USB Standard Keyboard', detail: 'Bangla + Eng layout · USB', detailBn: 'বাংলা ও ইংরেজি লেআউট', category: 'staples', unit: 'pc', price: 550, cost: 380, stock: 25000, purchased: 25000, groupId: 'keyboard', variantName: 'Standard', art: 'daily', color: '#f0dce1' },
  { id: 'keyboard-rgb', code: '103W', en: 'RGB Gaming Keyboard', detail: 'Backlit membrane · Gaming', detailBn: 'আরজিবি ব্যাকলিট · গেমিং', category: 'staples', unit: 'pc', price: 1200, cost: 850, stock: 15000, purchased: 15000, groupId: 'keyboard', variantName: 'RGB Backlit', art: 'daily', color: '#fffdfa' },
  { id: 'mousepad', code: '104', en: 'Gaming Mouse Pad', detail: 'Stitched border · Non-slip', detailBn: 'সেলাই বর্ডার · নন-স্লিপ', category: 'staples', unit: 'pc', price: 150, cost: 80, stock: 50000, purchased: 50000, art: 'daily', color: '#e5ebc9' },
  { id: 'pendrive-32gb', code: '105', en: 'USB Pendrive 32GB', detail: 'USB 3.2 Gen 1 · High speed', detailBn: 'ইউএসবি ৩.২ হাই-স্পিড', category: 'staples', unit: 'pc', price: 450, cost: 340, stock: 40000, purchased: 40000, art: 'daily', color: '#eae0cf' },
  { id: 'pendrive-64gb', code: '106', en: 'USB Pendrive 64GB', detail: 'USB 3.2 · Metal casing', detailBn: 'ইউএসবি ৩.২ মেটাল বডি', category: 'staples', unit: 'pc', price: 650, cost: 500, stock: 35000, purchased: 35000, art: 'daily', color: '#dee9d8' },
  { id: 'cable-hdmi', code: '107', en: 'HDMI Cable 1.5M 4K', detail: '4K 60Hz · Braided gold-plated', detailBn: '৪কে ৬০ হার্টজ · ব্রেইডেড', category: 'staples', unit: 'pc', price: 250, cost: 150, stock: 30000, purchased: 30000, art: 'daily', color: '#e0e8f0' },
  { id: 'cable-vga', code: '108', en: 'VGA Display Cable 1.5M', detail: 'Male to male with dual ferrite', detailBn: 'মেইল টু মেইল ডিসপ্লে ক্যাবল', category: 'staples', unit: 'pc', price: 200, cost: 120, stock: 25000, purchased: 25000, art: 'daily', color: '#eae0cf' },
  { id: 'cable-lan', code: '109', en: 'CAT6 LAN Cable 3M', detail: 'Gigabit ready patch cord', detailBn: 'গিগাবিট প্রস্তুত প্যাচ কর্ড', category: 'staples', unit: 'pc', price: 150, cost: 80, stock: 40000, purchased: 40000, art: 'daily', color: '#f0d7c6' },
  { id: 'headphone', code: '110', en: 'Headphone with Mic', detail: 'Adjustable headset · Clear audio', detailBn: 'মাইক্রোফোন সহ হেডসেট', category: 'staples', unit: 'pc', price: 850, cost: 600, stock: 20000, purchased: 20000, art: 'daily', color: '#e8e4d8' },
  { id: 'speaker-mini', code: '111', en: 'USB Mini Speaker 2.0', detail: 'Stereo desktop sound', detailBn: 'স্টেরিও ডেস্কটপ সাউন্ড', category: 'staples', unit: 'pc', price: 650, cost: 450, stock: 18000, purchased: 18000, art: 'daily', color: '#e6e5ee' },
  { id: 'casing-hdd', code: '112', en: '2.5" SATA HDD Enclosure', detail: 'USB 3.0 External Casing', detailBn: 'ইউএসবি ৩.০ এক্সটার্নাল কেস', category: 'staples', unit: 'pc', price: 550, cost: 380, stock: 22000, purchased: 22000, art: 'daily', color: '#eaddba' },
  { id: 'usb-hub', code: '113', en: '4-Port USB Hub', detail: 'High speed USB extension', detailBn: '৪টি ইউএসবি পোর্ট হাব', category: 'staples', unit: 'pc', price: 350, cost: 220, stock: 25000, purchased: 25000, art: 'daily', color: '#e0e8f0' },
  { id: 'cleaner-kit', code: '114', en: 'Screen Cleaning Kit', detail: 'Spray + Microfiber cloth', detailBn: 'স্প্রে ও মাইক্রোফাইবার কাপড়', category: 'staples', unit: 'pc', price: 150, cost: 80, stock: 35000, purchased: 35000, art: 'daily', color: '#d8e8ed' },

  // Computer Servicing & Repair (fresh)
  { id: 'service-windows', code: '201', en: 'Windows Setup & Essential Apps', detail: 'OS installation + Drivers + Office', detailBn: 'নতুন উইন্ডোজ + ড্রাইভার ও অফিস', category: 'fresh', unit: 'pc', price: 500, stock: 0, kind: 'service', art: 'cleaner', color: '#d8e8ed' },
  { id: 'service-pc-clean', code: '202', en: 'Desktop Full Servicing', detail: 'Blower clean + Thermal paste', detailBn: 'ব্লোয়ার ক্লিনিং ও থার্মাল পেস্ট', category: 'fresh', unit: 'pc', price: 400, stock: 0, kind: 'service', art: 'cleaner', color: '#e0e8f0' },
  { id: 'service-laptop-clean', code: '203', en: 'Laptop Deep Clean & Service', detail: 'Heatsink wash + Overheating fix', detailBn: 'হিটসিঙ্ক সার্ভিসিং ও ফ্যান ক্লিনিং', category: 'fresh', unit: 'pc', price: 800, stock: 0, kind: 'service', art: 'cleaner', color: '#e0e8f0' },
  { id: 'service-mobo', code: '204', en: 'Motherboard Servicing Charge', detail: 'Chip level diagnosis & repair', detailBn: 'মাদারবোর্ড রিপেয়ারিং ও চেকিং', category: 'fresh', unit: 'pc', price: 1000, stock: 0, kind: 'service', art: 'cleaner', color: '#d8e8ed' },
  { id: 'service-display', code: '205', en: 'Laptop Display Fitting Service', detail: 'Screen replacement labor charge', detailBn: 'ডিসপ্লে প্যানেল ফিটিং চার্জ', category: 'fresh', unit: 'pc', price: 500, stock: 0, kind: 'service', art: 'cleaner', color: '#e0e8f0' },
  { id: 'service-data', code: '206', en: 'Data Recovery Service', detail: 'Corrupted drive data retrieval', detailBn: 'হার্ডডিস্ক ডাটা পুনরুদ্ধার', category: 'fresh', unit: 'pc', price: 1500, stock: 0, kind: 'service', art: 'cleaner', color: '#e0e8f0' },
  { id: 'service-custom', code: '207', en: 'Custom Servicing Bill', detail: 'Variable repair / labor charge', detailBn: 'কাস্টম সার্ভিস ও মেরামত চার্জ', category: 'fresh', unit: 'pc', price: 1, stock: 0, kind: 'service', art: 'cleaner', color: '#e0e8f0' },

  // Hardware & Components (household)
  { id: 'ssd-128gb', code: '301', en: '128GB SATA III 2.5" SSD', detail: '550 MB/s speed · 3 yr warranty', detailBn: '৫৫০ মেগাবাইট/সে. স্পিড', category: 'household', unit: 'pc', price: 1450, cost: 1180, stock: 25000, purchased: 25000, art: 'daily', color: '#f1e4ca' },
  { id: 'ssd-256gb', code: '302', en: '256GB NVMe M.2 SSD', detail: 'Gen3x4 PCIe · High speed', detailBn: 'হাই-স্পিড এম.২ এনভিএমই', category: 'household', unit: 'pc', price: 2600, cost: 2150, stock: 20000, purchased: 20000, art: 'daily', color: '#f2dfce' },
  { id: 'ram-8gb-ddr4', code: '303', en: '8GB DDR4 Desktop RAM 3200MHz', detail: 'U-DIMM 3200MHz · Lifetime warranty', detailBn: 'ডেস্কটপ র‍্যাম · লাইফটাইম ওয়ারেন্টি', category: 'household', unit: 'pc', price: 2200, cost: 1800, stock: 15000, purchased: 15000, art: 'daily', color: '#e8e4d8' },
  { id: 'psu-450w', code: '304', en: '450W Desktop Power Supply', detail: '120mm silent fan · ATX', detailBn: 'ডেস্কটপ পাওয়ার সাপ্লাই ইউনিট', category: 'household', unit: 'pc', price: 1600, cost: 1250, stock: 12000, purchased: 12000, art: 'daily', color: '#d8e8ed' },
  { id: 'thermal-paste', code: '305', en: 'Thermal Paste Syringe 4g', detail: 'High performance cooling compound', detailBn: 'সিপিইউ ও জিপিইউ কুলিং পেস্ট', category: 'household', unit: 'pc', price: 180, cost: 90, stock: 35000, purchased: 35000, art: 'daily', color: '#f0dce1' },
  { id: 'cable-power', code: '306', en: 'Desktop Power Cable 3-Pin', detail: 'Heavy-duty copper wire 1.5m', detailBn: 'হেভি-ডিউটি তামার তার ১.৫ মিটার', category: 'household', unit: 'pc', price: 150, cost: 80, stock: 40000, purchased: 40000, art: 'daily', color: '#e4eaff' },
]
export const customers: Customer[] = [
  { id: 'c1', en: 'Nadia Rahman', bn: 'নাদিয়া রহমান', phone: '01700000101' },
  { id: 'c2', en: 'Karim Ahmed', bn: 'করিম আহমেদ', phone: '01700000102' },
  { id: 'c3', en: 'Shila Begum', bn: 'শীলা বেগম', phone: '01700000103' },
]
export const initialState: ShopState = {
  version: 2,
  lines: [{ productId: 'mouse-opt', quantity: 1000 }, { productId: 'keyboard-usb', quantity: 1000 }],
  customProducts: products, discount: 0, customerId: null, receipts: [], customCustomers: customers, transactions: [], purchases: [], suppliers: [], supplierPayments: [], purchaseSettlements: [], stockReceivings: [], expenses: [], adjustments: [], returns: [],
}

export const findProduct = (id: string): Product => {
  const product = products.find(item => item.id === id)
  if (!product) throw new Error("Unknown fixture product: " + id)
  return product
}

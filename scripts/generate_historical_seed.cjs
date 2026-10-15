// Corrected historical data generator for Mayer Dowa Telecom & IT Accessories
// Period: April 15, 2026 to October 15, 2026 (~6 months).
// Guarantees:
// 1. Absolutely NO negative stock:
//    stockFor(product, receipts) = product.stock - sold >= 0 for all products.
//    catalog.stock holds the current remaining on-hand inventory.
// 2. Clear, accurate supplier accounts:
//    Supplier purchases record exact initial payment (or partial credit due),
//    with NO duplicate counting between purchase.paid and supplier_payments.
//    Supports realistic, positive outstanding payable balances to suppliers where appropriate.

const fs = require('fs');
const ts = require('typescript');

function loadModule(srcPath) {
  let content = fs.readFileSync(srcPath, 'utf8');
  const js = ts.transpileModule(content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const m = { exports: {} };
  const customRequire = (id) => {
    if (id === '../src/model' || id === './model') return modelMod;
    if (id === './validate') return validateMod;
    if (id === './recalc') return recalcMod;
    if (id === './inventory') return inventoryMod;
    return require(id);
  };
  const fn = new Function('require', 'module', 'exports', js);
  fn(customRequire, m, m.exports);
  return m.exports;
}

let modelMod, validateMod, recalcMod, inventoryMod;
modelMod = loadModule('src/model.ts');
validateMod = loadModule('worker/validate.ts');
recalcMod = loadModule('worker/recalc.ts');
inventoryMod = loadModule('worker/inventory.ts');

const { lineTotal, isService, stockFor, supplierAccount } = modelMod;
const { computeReceipt } = recalcMod;

// 1. Catalog Products
const baseProducts = [
  // Computer & Peripheral Accessories (staples)
  { id: 'mouse-opt', code: '101', en: 'USB Optical Mouse', category: 'staples', unit: 'pc', price: 350, cost: 220, art: 'daily', color: '#e4eaff', detail: '1000 DPI · 1.5m wire', detailBn: '১০০০ ডিপিআই · তারযুক্ত', warranty: '6 Months' },
  { id: 'mouse-wireless', code: '102', en: 'Wireless Mouse 2.4GHz', category: 'staples', unit: 'pc', price: 650, cost: 420, art: 'daily', color: '#d8e8ed', detail: 'Silent click · Nano receiver', detailBn: 'সাইলেন্ট ক্লিক · ন্যানো রিসিভার', warranty: '6 Months' },
  { id: 'keyboard-usb', code: '103', en: 'USB Standard Keyboard', category: 'staples', unit: 'pc', price: 550, cost: 360, art: 'daily', color: '#f0dce1', detail: 'Bangla + Eng layout · USB', detailBn: 'বাংলা ও ইংরেজি লেআউট', warranty: '6 Months' },
  { id: 'keyboard-rgb', code: '104', en: 'RGB Gaming Keyboard', category: 'staples', unit: 'pc', price: 1250, cost: 850, art: 'daily', color: '#fffdfa', detail: 'Backlit membrane · Gaming', detailBn: 'আরজিবি ব্যাকলিট · গেমিং', warranty: '1 Year' },
  { id: 'mousepad', code: '105', en: 'Gaming Mouse Pad XL', category: 'staples', unit: 'pc', price: 180, cost: 90, art: 'daily', color: '#e5ebc9', detail: 'Stitched border · Non-slip', detailBn: 'সেলাই বর্ডার · নন-স্লিপ', warranty: '' },
  { id: 'pendrive-32gb', code: '106', en: 'USB Pendrive 32GB', category: 'staples', unit: 'pc', price: 450, cost: 320, art: 'daily', color: '#eae0cf', detail: 'USB 3.2 Gen 1 · High speed', detailBn: 'ইউএসবি ৩.২ হাই-স্পিড', warranty: '5 Years' },
  { id: 'pendrive-64gb', code: '107', en: 'USB Pendrive 64GB', category: 'staples', unit: 'pc', price: 650, cost: 480, art: 'daily', color: '#dee9d8', detail: 'USB 3.2 · Metal casing', detailBn: 'ইউএসবি ৩.২ মেটাল বডি', warranty: '5 Years' },
  { id: 'cable-hdmi', code: '108', en: 'HDMI Cable 1.5M 4K', category: 'staples', unit: 'pc', price: 250, cost: 140, art: 'daily', color: '#e0e8f0', detail: '4K 60Hz · Braided gold-plated', detailBn: '৪কে ৬০ হার্টজ · ব্রেইডেড', warranty: '' },
  { id: 'cable-vga', code: '109', en: 'VGA Display Cable 1.5M', category: 'staples', unit: 'pc', price: 200, cost: 110, art: 'daily', color: '#eae0cf', detail: 'Male to male with dual ferrite', detailBn: 'মেইল টু মেইল ডিসপ্লে ক্যাবল', warranty: '' },
  { id: 'cable-lan', code: '110', en: 'CAT6 LAN Cable 3M', category: 'staples', unit: 'pc', price: 150, cost: 70, art: 'daily', color: '#f0d7c6', detail: 'Gigabit ready patch cord', detailBn: 'গিগাবিট প্রস্তুত প্যাচ কর্ড', warranty: '' },
  { id: 'headphone', code: '111', en: 'Headphone with Mic', category: 'staples', unit: 'pc', price: 850, cost: 580, art: 'daily', color: '#e8e4d8', detail: 'Adjustable headset · Clear audio', detailBn: 'মাইক্রোফোন সহ হেডসেট', warranty: '1 Year' },
  { id: 'speaker-mini', code: '112', en: 'USB Mini Speaker 2.0', category: 'staples', unit: 'pc', price: 650, cost: 430, art: 'daily', color: '#e6e5ee', detail: 'Stereo desktop sound', detailBn: 'স্টেরিও ডেস্কটপ সাউন্ড', warranty: '6 Months' },
  { id: 'casing-hdd', code: '113', en: '2.5" SATA HDD Enclosure', category: 'staples', unit: 'pc', price: 550, cost: 360, art: 'daily', color: '#eaddba', detail: 'USB 3.0 External Casing', detailBn: 'ইউএসবি ৩.০ এক্সটার্নাল কেস', warranty: '1 Year' },
  { id: 'usb-hub', code: '114', en: '4-Port USB 3.0 Hub', category: 'staples', unit: 'pc', price: 450, cost: 280, art: 'daily', color: '#e0e8f0', detail: 'High speed USB extension', detailBn: '৪টি ইউএসবি পোর্ট হাব', warranty: '6 Months' },
  { id: 'cleaner-kit', code: '115', en: 'Screen Cleaning Kit', category: 'staples', unit: 'pc', price: 150, cost: 75, art: 'daily', color: '#d8e8ed', detail: 'Spray + Microfiber cloth', detailBn: 'স্প্রে ও মাইক্রোফাইবার কাপড়', warranty: '' },

  // Mobile / Telecom Accessories (staples / household)
  { id: 'charger-typec', code: '116', en: 'Fast Charger 20W Type-C', category: 'staples', unit: 'pc', price: 450, cost: 280, art: 'daily', color: '#e4eaff', detail: 'PD QC3.0 · Fast charging adapter', detailBn: '২০ ওয়াট ফাস্ট চার্জার', warranty: '6 Months' },
  { id: 'cable-typec', code: '117', en: 'Braided Type-C Cable 1M', category: 'staples', unit: 'pc', price: 180, cost: 90, art: 'daily', color: '#e8e4d8', detail: '6A fast charging & data sync', detailBn: 'টাইপ-সি ফাস্ট চার্জিং ক্যাবল', warranty: '3 Months' },
  { id: 'cable-lightning', code: '118', en: 'iPhone Lightning Cable', category: 'staples', unit: 'pc', price: 250, cost: 130, art: 'daily', color: '#fffdfa', detail: 'iOS fast charge cable', detailBn: 'আইফোন লাইটনিং ক্যাবল', warranty: '3 Months' },
  { id: 'earphone-typec', code: '119', en: 'Type-C Hi-Fi Earphone', category: 'staples', unit: 'pc', price: 350, cost: 200, art: 'daily', color: '#d8e8ed', detail: 'DAC chip · Deep bass stereo', detailBn: 'টাইপ-সি ডিজিটাল হেডফোন', warranty: '3 Months' },
  { id: 'earphone-35mm', code: '120', en: '3.5mm In-Ear Earphone', category: 'staples', unit: 'pc', price: 200, cost: 100, art: 'daily', color: '#dee9d8', detail: 'Tangle-free wire · Mic', detailBn: '৩.৫ মিমি স্টেরিও ইয়ারফোন', warranty: '1 Month' },
  { id: 'powerbank-10k', code: '121', en: '10000mAh Power Bank', category: 'household', unit: 'pc', price: 1450, cost: 1050, art: 'daily', color: '#e0e8f0', detail: 'Dual USB + Type-C 22.5W', detailBn: '১০,০০০ মিলিঅ্যাম্পিয়ার পাওয়ার ব্যাংক', warranty: '1 Year' },
  { id: 'otg-adapter', code: '122', en: 'Type-C to USB OTG Adapter', category: 'staples', unit: 'pc', price: 100, cost: 45, art: 'daily', color: '#f0d7c6', detail: 'Metal zinc alloy adapter', detailBn: 'টাইপ-সি ওটিজি অ্যাডাপ্টার', warranty: '' },

  // Internal PC Hardware & Components (household)
  { id: 'ssd-128gb', code: '301', en: '128GB SATA III 2.5" SSD', category: 'household', unit: 'pc', price: 1450, cost: 1150, art: 'daily', color: '#f1e4ca', detail: '550 MB/s speed · 3 yr warranty', detailBn: '৫৫০ মেগাবাইট/সে. স্পিড', warranty: '3 Years' },
  { id: 'ssd-256gb', code: '302', en: '256GB NVMe M.2 SSD', category: 'household', unit: 'pc', price: 2600, cost: 2100, art: 'daily', color: '#f2dfce', detail: 'Gen3x4 PCIe · High speed', detailBn: 'হাই-স্পিড এম.২ এনভিএমই', warranty: '3 Years' },
  { id: 'ssd-512gb', code: '303', en: '512GB NVMe M.2 SSD', category: 'household', unit: 'pc', price: 4200, cost: 3500, art: 'daily', color: '#f0dce1', detail: 'High speed read/write NVMe', detailBn: '৫১২জিবি এম.২ এসএসডি', warranty: '3 Years' },
  { id: 'ram-8gb-ddr4', code: '304', en: '8GB DDR4 Desktop RAM 3200MHz', category: 'household', unit: 'pc', price: 2200, cost: 1750, art: 'daily', color: '#e8e4d8', detail: 'U-DIMM 3200MHz · Lifetime warranty', detailBn: 'ডেস্কটপ র‍্যাম · লাইফটাইম ওয়ারেন্টি', warranty: 'Lifetime' },
  { id: 'ram-16gb-ddr4', code: '305', en: '16GB DDR4 Desktop RAM 3200MHz', category: 'household', unit: 'pc', price: 3900, cost: 3200, art: 'daily', color: '#eae0cf', detail: 'Heatsink U-DIMM 3200MHz', detailBn: '১৬জিবি ডিডিআর৪ র‍্যাম', warranty: 'Lifetime' },
  { id: 'psu-450w', code: '306', en: '450W Desktop Power Supply', category: 'household', unit: 'pc', price: 1600, cost: 1200, art: 'daily', color: '#d8e8ed', detail: '120mm silent fan · ATX', detailBn: 'ডেস্কটপ পাওয়ার সাপ্লাই ইউনিট', warranty: '2 Years' },
  { id: 'thermal-paste', code: '307', en: 'Thermal Paste Syringe 4g', category: 'household', unit: 'pc', price: 180, cost: 85, art: 'daily', color: '#f0dce1', detail: 'High performance cooling compound', detailBn: 'সিপিইউ ও জিপিইউ কুলিং পেস্ট', warranty: '' },
  { id: 'cable-power', code: '308', en: 'Desktop Power Cable 3-Pin', category: 'household', unit: 'pc', price: 150, cost: 75, art: 'daily', color: '#e4eaff', detail: 'Heavy-duty copper wire 1.5m', detailBn: 'হেভি-ডিউটি তামার তার ১.৫ মিটার', warranty: '' },
  { id: 'router-wifi', code: '309', en: '300Mbps Wireless N Router', category: 'household', unit: 'pc', price: 1650, cost: 1300, art: 'daily', color: '#e0e8f0', detail: '4 high-gain antennas · Multi-mode', detailBn: '৪ অ্যান্টেনা ওয়াইফাই রাউটার', warranty: '1 Year' },

  // IT & Computer Servicing Charges (fresh category with kind: 'service')
  { id: 'service-windows', code: '201', en: 'Windows Setup & Essential Apps', category: 'fresh', unit: 'pc', price: 500, cost: 0, kind: 'service', art: 'cleaner', color: '#d8e8ed', detail: 'OS installation + Drivers + Office', detailBn: 'নতুন উইন্ডোজ + ড্রাইভার ও অফিস', warranty: '1 Month' },
  { id: 'service-pc-clean', code: '202', en: 'Desktop Full Servicing', category: 'fresh', unit: 'pc', price: 400, cost: 0, kind: 'service', art: 'cleaner', color: '#e0e8f0', detail: 'Blower clean + Thermal paste', detailBn: 'ব্লোয়ার ক্লিনিং ও থার্মাল পেস্ট', warranty: '' },
  { id: 'service-laptop-clean', code: '203', en: 'Laptop Deep Clean & Service', category: 'fresh', unit: 'pc', price: 800, cost: 0, kind: 'service', art: 'cleaner', color: '#e0e8f0', detail: 'Heatsink wash + Overheating fix', detailBn: 'হিটসিঙ্ক সার্ভিসিং ও ফ্যান ক্লিনিং', warranty: '' },
  { id: 'service-mobo', code: '204', en: 'Motherboard Servicing Charge', category: 'fresh', unit: 'pc', price: 1000, cost: 0, kind: 'service', art: 'cleaner', color: '#d8e8ed', detail: 'Chip level diagnosis & repair', detailBn: 'মাদারবোর্ড রিপেয়ারিং ও চেকিং', warranty: '1 Month' },
  { id: 'service-display', code: '205', en: 'Laptop Display Fitting Service', category: 'fresh', unit: 'pc', price: 500, cost: 0, kind: 'service', art: 'cleaner', color: '#e0e8f0', detail: 'Screen replacement labor charge', detailBn: 'ডিসপ্লে প্যানেল ফিটিং চার্জ', warranty: '1 Month' },
  { id: 'service-data', code: '206', en: 'Data Recovery Service', category: 'fresh', unit: 'pc', price: 1500, cost: 0, kind: 'service', art: 'cleaner', color: '#e0e8f0', detail: 'Corrupted drive data retrieval', detailBn: 'হার্ডডিস্ক ডাটা পুনরুদ্ধার', warranty: '' },
  { id: 'service-custom', code: '207', en: 'Custom Hardware Repair', category: 'fresh', unit: 'pc', price: 300, cost: 0, kind: 'service', art: 'cleaner', color: '#e0e8f0', detail: 'Variable repair / soldering labor', detailBn: 'কাস্টম সার্ভিস ও মেরামত চার্জ', warranty: '' }
];

// 2. Suppliers
const suppliers = [
  { id: 'sup-startech', name: 'Star Tech & Engineering Ltd (IDB Branch)', phone: '01709-995555', address: 'BCS Computer City, IDB Bhaban, Agargaon, Dhaka', note: 'Primary PC component and SSD supplier' },
  { id: 'sup-ryans', name: 'Ryans Computers Multiplan', phone: '01755-662211', address: 'Multiplan Center, New Elephant Road, Dhaka', note: 'Peripherals, RAM, and monitor accessories' },
  { id: 'sup-unicomp', name: 'Universal Computer & Accessories', phone: '01819-334455', address: 'Cheragali Market, Tongi, Gazipur', note: 'Local emergency accessory & cable supplies' },
  { id: 'sup-smart', name: 'Smart Technologies BD Ltd', phone: '01911-889900', address: 'Jahangir Tower, Karwan Bazar, Dhaka', note: 'Authorized distributor for storage & routers' }
];

// 3. Customers
const customers = [
  { id: 'cust-kamal', en: 'Kamal Hossain (Freelancer)', bn: 'কামাল হোসেন', phone: '01712-345678', address: 'Cheragali, Tongi', openingBalance: 0, note: 'Regular customer for PC upgrades & accessories' },
  { id: 'cust-masud', en: 'Engr. Masud Rana', bn: 'মাসুদ রানা', phone: '01819-876543', address: 'Station Road, Tongi', openingBalance: 0, note: 'Office PC maintenance client' },
  { id: 'cust-rafiq', en: 'Rafiqul Islam (Press Corner)', bn: 'রফিকুল ইসলাম', phone: '01911-223344', address: 'Hossain Market, Gazipur', openingBalance: 0, note: 'Frequent printing shop owner, bulk cables & flash drives' },
  { id: 'cust-tanvir', en: 'Tanvir Ahmed (College Student)', bn: 'তানভীর আহমেদ', phone: '01678-554433', address: 'College Gate, Tongi', openingBalance: 0, note: 'Gaming accessories buyer' },
  { id: 'cust-jahid', en: 'Jahid Hasan (Telecom Agent)', bn: 'জাহিদ হাসান', phone: '01730-112233', address: 'Tongi Bazar', openingBalance: 0, note: 'Purchases chargers, OTG, and cables' },
  { id: 'cust-alamin', en: 'Al-Amin Traders', bn: 'আল-আমিন ট্রেডার্স', phone: '01822-445566', address: 'Board Bazar, Gazipur', openingBalance: 0, note: 'Commercial accounting and servicing' },
  { id: 'cust-shakil', en: 'Dr. Shakil Mahmud', bn: 'ডা. শাকিল মাহমুদ', phone: '01755-998877', address: 'Cheragali Medical Road', openingBalance: 0, note: 'Laptop servicing and SSD upgrades' },
  { id: 'cust-faruk', en: 'Faruk Enterprise', bn: 'ফারুক এন্টারপ্রাইজ', phone: '01977-332211', address: 'Mill Gate, Tongi', openingBalance: 0, note: 'CCTV & networking maintenance' }
];

// Target realistic inventory purchase numbers (units)
const productPurchasedUnits = {
  'mouse-opt': 80,
  'mouse-wireless': 50,
  'keyboard-usb': 50,
  'keyboard-rgb': 25,
  'mousepad': 90,
  'pendrive-32gb': 60,
  'pendrive-64gb': 60,
  'cable-hdmi': 50,
  'cable-vga': 40,
  'cable-lan': 80,
  'headphone': 30,
  'speaker-mini': 30,
  'casing-hdd': 35,
  'usb-hub': 45,
  'cleaner-kit': 60,
  'charger-typec': 60,
  'cable-typec': 80,
  'cable-lightning': 50,
  'earphone-typec': 65,
  'earphone-35mm': 75,
  'powerbank-10k': 25,
  'otg-adapter': 100,
  'ssd-128gb': 45,
  'ssd-256gb': 40,
  'ssd-512gb': 20,
  'ram-8gb-ddr4': 35,
  'ram-16gb-ddr4': 20,
  'psu-450w': 25,
  'thermal-paste': 60,
  'cable-power': 80,
  'router-wifi': 25
};

// Simulation date range
const startDate = new Date('2026-04-15T09:00:00.000Z');
const endDate = new Date('2026-10-15T15:00:00.000Z');

let seed = 12345;
function random() {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
}
function randChoice(arr) {
  return arr[Math.floor(random() * arr.length)];
}
function randInt(min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

// 4. Generate Daily Receipts
const catalogMap = new Map();
for (const p of baseProducts) {
  catalogMap.set(p.id, {
    price: p.price,
    cost: p.cost,
    warranty: p.warranty,
    product: { ...p, stock: 1_000_000 }, // Generous temporary stock during receipt validation
    costStatus: 'recorded'
  });
}

let receiptNumber = 1001;
const receipts = [];
const transactions = [];
const totalSoldUnits = {};
for (const p of baseProducts) totalSoldUnits[p.id] = 0;

const customerDueBalances = {};
for (const c of customers) customerDueBalances[c.id] = 0;

let currentDate = new Date(startDate.getTime());
while (currentDate <= endDate) {
  const isFriday = currentDate.getUTCDay() === 5;
  const numReceipts = isFriday ? randInt(2, 4) : randInt(3, 7);

  for (let r = 0; r < numReceipts; r++) {
    const hours = randInt(9, 20);
    const minutes = randInt(0, 59);
    const seconds = randInt(0, 59);
    const receiptTime = new Date(currentDate.getTime());
    receiptTime.setUTCHours(hours, minutes, seconds);

    if (receiptTime > endDate) break;

    const numItems = random() < 0.7 ? 1 : (random() < 0.9 ? 2 : 3);
    const chosenProducts = [];
    const usedIds = new Set();

    for (let i = 0; i < numItems; i++) {
      let prod;
      let attempts = 0;
      do {
        prod = randChoice(baseProducts);
        attempts++;
      } while (attempts < 20 && usedIds.has(prod.id));

      if (usedIds.has(prod.id)) continue;
      usedIds.add(prod.id);

      // Check that sold quantity doesn't exceed 85% of total purchased units
      if (!isService(prod)) {
        const maxAllowedSold = Math.floor((productPurchasedUnits[prod.id] || 0) * 0.85);
        if (totalSoldUnits[prod.id] >= maxAllowedSold) continue;
      }

      const qty = isService(prod) ? 1 : (random() < 0.85 ? 1 : 2);
      chosenProducts.push({ productId: prod.id, quantity: qty * 1000 });
    }

    if (chosenProducts.length === 0) continue;

    const hasCustomer = random() < 0.35;
    const customer = hasCustomer ? randChoice(customers) : null;

    let subtotal = 0;
    for (const l of chosenProducts) {
      const prod = baseProducts.find(p => p.id === l.productId);
      subtotal += lineTotal(prod.price, l.quantity);
    }

    let discount = 0;
    if (subtotal >= 1000 && random() < 0.25) {
      discount = randChoice([20, 50, 100]);
    }
    const total = subtotal - discount;

    const methodChoice = random();
    const method = methodChoice < 0.65 ? 'cash' : (methodChoice < 0.9 ? 'mobile' : 'bank');

    let tendered = total;
    if (hasCustomer && random() < 0.12 && total >= 500) {
      const duePortion = randChoice([200, 300, 500, 1000]);
      tendered = Math.max(0, total - duePortion);
    }

    const receiptInput = {
      id: `rcpt-${receiptNumber}`,
      number: receiptNumber,
      createdAt: receiptTime.toISOString(),
      customerId: customer ? customer.id : null,
      lines: chosenProducts,
      discount,
      tendered,
      method,
      remarks: isService(chosenProducts[0]) ? 'Servicing & maintenance done' : undefined,
      preparedBy: 'Masum'
    };

    const computed = computeReceipt(receiptInput, catalogMap);
    receipts.push(computed);

    for (const l of chosenProducts) {
      totalSoldUnits[l.productId] += (l.quantity / 1000);
    }

    if (customer && computed.due > 0) {
      customerDueBalances[customer.id] += computed.due;
    }

    receiptNumber++;
  }

  // Customer due partial payments
  if (random() < 0.15) {
    const dueCusts = customers.filter(c => customerDueBalances[c.id] > 0);
    if (dueCusts.length > 0) {
      const c = randChoice(dueCusts);
      const payAmount = Math.min(customerDueBalances[c.id], randChoice([200, 500, 1000]));
      if (payAmount > 0) {
        const txTime = new Date(currentDate.getTime());
        txTime.setUTCHours(16, randInt(0, 59), 0);
        transactions.push({
          id: `tx-pay-${transactions.length + 1}`,
          customerId: c.id,
          type: 'payment',
          amount: payAmount,
          createdAt: txTime.toISOString(),
          note: 'Due partial repayment in cash'
        });
        customerDueBalances[c.id] -= payAmount;
      }
    }
  }

  currentDate.setUTCDate(currentDate.getUTCDate() + 1);
}

// 5. Build Final Custom Products Catalog with guaranteed positive on-hand stock
// stockFor(product, receipts) = product.stock - sold >= 0
// Therefore: product.stock = totalPurchasedUnits * 1000!
const customProductsFinal = baseProducts.map(p => {
  if (isService(p)) {
    return {
      ...p,
      stock: 0,
      purchased: 0,
      cost: null,
      inventoryValue: 0,
      valuationStatus: 'verified'
    };
  }

  const purchasedUnits = productPurchasedUnits[p.id];
  const soldUnits = totalSoldUnits[p.id];
  const remainingUnits = purchasedUnits - soldUnits;
  const inventoryValue = Math.round(remainingUnits * p.cost);

  return {
    ...p,
    // The base stock in DB must equal total purchased units, so that stock - sold = remaining!
    stock: purchasedUnits * 1000,
    purchased: purchasedUnits * 1000,
    cost: p.cost,
    inventoryValue,
    valuationStatus: 'verified'
  };
});

// Verify that stockFor is strictly >= 0 for all products!
for (const p of customProductsFinal) {
  const currentOnHand = stockFor(p, receipts);
  if (currentOnHand < 0) {
    throw new Error(`CRITICAL: Stock for ${p.id} is negative: ${currentOnHand}`);
  }
}

// 6. Build Supplier Purchases with realistic paid amounts & realistic remaining payables
// NO duplicate supplier_payments for initial paid amounts!
const purchases = [];
const supplierPayments = [];

const restockEvents = [
  {
    id: 'purch-1',
    date: '2026-04-12T10:00:00.000Z',
    supplier: suppliers[0], // Star Tech (IDB Branch)
    invoiceNo: 'ST-2026-0412',
    ratio: 0.40,
    note: 'Initial bulk inventory replenishment invoice',
    // 100% fully paid via bank transfer at purchase time
    paidPct: 1.0,
    method: 'bank'
  },
  {
    id: 'purch-2',
    date: '2026-06-01T11:00:00.000Z',
    supplier: suppliers[1], // Ryans Multiplan
    invoiceNo: 'RY-2026-0601',
    ratio: 0.25,
    note: 'Q2 peripherals and RAM restock invoice',
    // Fully paid at purchase time
    paidPct: 1.0,
    method: 'bank'
  },
  {
    id: 'purch-3',
    date: '2026-07-20T14:00:00.000Z',
    supplier: suppliers[2], // Universal Computer Tongi
    invoiceNo: 'UC-2026-0720',
    ratio: 0.15,
    note: 'Emergency cables & accessories restock invoice',
    // Fully paid at purchase time
    paidPct: 1.0,
    method: 'cash'
  },
  {
    id: 'purch-4',
    date: '2026-09-10T11:30:00.000Z',
    supplier: suppliers[3], // Smart Technologies BD Ltd
    invoiceNo: 'SM-2026-0910',
    ratio: 0.20,
    note: 'Autumn SSD & Router inventory invoice',
    // 70% paid initial; 30% credit balance outstanding to Smart Tech
    paidPct: 0.70,
    method: 'bank'
  }
];

const physicalProds = baseProducts.filter(p => !isService(p));

restockEvents.forEach((event, idx) => {
  const purchaseLines = [];
  for (const p of physicalProds) {
    const totalP = productPurchasedUnits[p.id];
    let qty;
    if (idx === 0) qty = Math.floor(totalP * 0.40);
    else if (idx === 1) qty = Math.floor(totalP * 0.25);
    else if (idx === 2) qty = Math.floor(totalP * 0.15);
    else qty = totalP - Math.floor(totalP * 0.40) - Math.floor(totalP * 0.25) - Math.floor(totalP * 0.15);

    if (qty > 0) {
      purchaseLines.push({
        productId: p.id,
        quantity: qty * 1000,
        unitCost: p.cost,
        total: qty * p.cost
      });
    }
  }

  const purchaseTotal = purchaseLines.reduce((s, l) => s + l.total, 0);
  const initialPaid = Math.round(purchaseTotal * event.paidPct);

  purchases.push({
    id: event.id,
    createdAt: event.date,
    supplierId: event.supplier.id,
    supplier: event.supplier.name,
    paid: initialPaid, // Exact initial amount paid to supplier
    method: event.method,
    invoiceNumber: event.invoiceNo,
    note: event.note,
    total: purchaseTotal,
    lines: purchaseLines
  });

  // DO NOT add a duplicate entry in supplierPayments for the initial purchase.paid!
  // supplier_payments are ONLY for subsequent installment payments!
});

// Verify supplier accounts:
console.log('--- Supplier Accounts Audit ---');
for (const s of suppliers) {
  const acct = supplierAccount(s.id, purchases, supplierPayments);
  console.log(`Supplier [${s.name}]: Total Invoices = ৳${acct.total.toLocaleString()}, Total Paid = ৳${acct.paid.toLocaleString()}, Outstanding Due = ৳${acct.due.toLocaleString()}`);
}

// 7. Expenses
const expenses = [];
let expenseIdCounter = 1;
for (let month = 4; month <= 10; month++) {
  const mStr = String(month).padStart(2, '0');
  expenses.push({
    id: `exp-${expenseIdCounter++}`,
    createdAt: `2026-${mStr}-05T10:00:00.000Z`,
    category: 'rent',
    amount: 12000,
    method: 'bank',
    note: `Shop rent for month ${mStr} - Plabon Bhaban, Cheragali`
  });
  expenses.push({
    id: `exp-${expenseIdCounter++}`,
    createdAt: `2026-${mStr}-12T11:30:00.000Z`,
    category: 'utility',
    amount: randInt(2200, 3100),
    method: 'mobile',
    note: 'Electricity bill payment (DESCO)'
  });
  expenses.push({
    id: `exp-${expenseIdCounter++}`,
    createdAt: `2026-${mStr}-10T14:00:00.000Z`,
    category: 'utility',
    amount: 1000,
    method: 'mobile',
    note: 'Broadband optical fiber bill'
  });
  if (month > 4) {
    expenses.push({
      id: `exp-${expenseIdCounter++}`,
      createdAt: `2026-${mStr}-01T10:00:00.000Z`,
      category: 'salary',
      amount: 15000,
      method: 'bank',
      note: 'Staff monthly salary'
    });
  }
  for (let k = 0; k < 3; k++) {
    const day = randInt(1, 28);
    const dStr = String(day).padStart(2, '0');
    expenses.push({
      id: `exp-${expenseIdCounter++}`,
      createdAt: `2026-${mStr}-${dStr}T15:20:00.000Z`,
      category: 'transport',
      amount: randInt(150, 400),
      method: 'cash',
      note: 'Local courier & IDB Dhaka transport for parts delivery'
    });
  }
}

// Summary audit
console.log('--- Historical Simulation Audit ---');
console.log(`Receipts: ${receipts.length}`);
console.log(`Expenses: ${expenses.length}`);
console.log(`Purchases: ${purchases.length}`);
console.log(`Customers: ${customers.length}`);
console.log(`Suppliers: ${suppliers.length}`);
console.log(`Transactions: ${transactions.length}`);

// Check minimum remaining stock across all items
let minStock = Infinity;
let minProduct = '';
for (const p of customProductsFinal) {
  if (isService(p)) continue;
  const onHand = stockFor(p, receipts) / 1000;
  if (onHand < minStock) {
    minStock = onHand;
    minProduct = p.en;
  }
}
console.log(`Lowest remaining on-hand stock: ${minStock} units (${minProduct})`);

fs.writeFileSync('scripts/historical_seed_data.json', JSON.stringify({
  customProducts: customProductsFinal,
  customCustomers: customers,
  suppliers,
  purchases,
  supplierPayments,
  receipts,
  transactions,
  expenses
}, null, 2));

console.log('Saved corrected data to scripts/historical_seed_data.json');

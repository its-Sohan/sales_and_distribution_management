-- Cloudflare D1 Migration for Hisab Counter
-- Migration 0008: Convert monetary amounts from poisha (minor units) to integer Taka
-- All prices, costs, expenses, discounts, customer balances, and transaction amounts
-- now store and operate in whole 1 Taka integers.

-- 1. Expenses: convert amount
UPDATE expenses
SET amount = ROUND(amount / 100.0);

-- 2. Purchases: convert total
UPDATE purchases
SET total = ROUND(total / 100.0);

-- 3. Account Transactions: convert amount
UPDATE account_transactions
SET amount = ROUND(amount / 100.0);

-- 4. Receipts: convert subtotal, discount, total, paid, tendered, change, due
UPDATE receipts
SET subtotal = ROUND(subtotal / 100.0),
    discount = ROUND(discount / 100.0),
    total = ROUND(total / 100.0),
    paid = ROUND(paid / 100.0),
    tendered = ROUND(tendered / 100.0),
    change = ROUND(change / 100.0),
    due = ROUND(due / 100.0);

-- 5. Returns: convert refunded
UPDATE returns
SET refunded = ROUND(refunded / 100.0);

-- 6. Custom Products: convert price and cost (when present)
UPDATE custom_products
SET price = ROUND(price / 100.0),
    cost = CASE WHEN cost IS NOT NULL THEN ROUND(cost / 100.0) ELSE NULL END;

-- 7. Custom Customers: convert credit_limit and opening_balance (when present)
UPDATE custom_customers
SET credit_limit = CASE WHEN credit_limit IS NOT NULL THEN ROUND(credit_limit / 100.0) ELSE NULL END,
    opening_balance = CASE WHEN opening_balance IS NOT NULL THEN ROUND(opening_balance / 100.0) ELSE NULL END;

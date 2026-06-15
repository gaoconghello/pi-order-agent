import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// 订单与退货表
export const orders = sqliteTable('orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  groupId: text('group_id').notNull(),
  buyer: text('buyer').notNull(),
  itemName: text('item_name').notNull(),
  quantity: integer('quantity').notNull(),
  price: integer('price'), // 可选价格
  type: text('type', { enum: ['ORDER', 'RETURN'] }).default('ORDER').notNull(),
  status: text('status', { enum: ['PENDING', 'CONFIRMED', 'CANCELLED'] }).default('PENDING').notNull(),
  confidence: text('confidence', { enum: ['HIGH', 'PENDING_REVIEW'] }).notNull(),
  rawMessage: text('raw_message').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// 转账记录表
export const transactions = sqliteTable('transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  groupId: text('group_id').notNull(),
  sender: text('sender').notNull(),
  amount: integer('amount').notNull(),
  status: text('status', { enum: ['UNVERIFIED', 'VERIFIED'] }).default('UNVERIFIED').notNull(),
  confidence: text('confidence', { enum: ['HIGH', 'PENDING_REVIEW'] }).notNull(),
  rawMessage: text('raw_message').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// 价格变动映射表
export const priceRules = sqliteTable('price_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  groupId: text('group_id').notNull(),
  itemName: text('item_name').notNull(),
  agreedPrice: integer('agreed_price').notNull(),
  effectiveDate: text('effective_date').default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

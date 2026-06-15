import { db } from '../store/db';
import { orders } from '../store/schema';
import { eq } from 'drizzle-orm';

export const queryTool = {
  name: 'query_orders',
  label: 'query_orders',
  description: '查询群内历史订单。当用户问“今天定了什么”、“查一下我定了多少”等时调用。',
  parameters: {
    type: 'object',
    properties: {
      groupId: { type: 'string', description: '微信群唯一ID' },
      buyer: { type: 'string', description: '查询的买家昵称（可选）' },
    },
    required: ['groupId']
  },
  execute: async (toolCallId: string, args: any) => {
    const allOrders = await db.select().from(orders).where(eq(orders.groupId, args.groupId));
    let result = allOrders;
    if (args.buyer) {
      result = allOrders.filter(o => o.buyer.includes(args.buyer));
    }
    return { 
      status: 'success', 
      message: `查询到 ${result.length} 条记录。`,
      data: result.slice(-10) 
    };
  }
};

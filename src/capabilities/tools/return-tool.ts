import { db } from '../store/db';
import { orders } from '../store/schema';

export const returnTool = {
  name: 'record_return',
  label: 'record_return',
  description: '当群成员明确表达退货、退款意图时调用此工具。',
  parameters: {
    type: 'object',
    properties: {
      groupId: { type: 'string', description: '微信群唯一ID' },
      buyer: { type: 'string', description: '退货人的微信昵称' },
      itemName: { type: 'string', description: '退货商品名称或品类' },
      quantity: { type: 'number', description: '退货数量，正数' },
      confidence: { type: 'string', enum: ['HIGH', 'PENDING_REVIEW'], description: '如果语义模糊或存在多人口径不一致，务必传 PENDING_REVIEW' },
      rawMessage: { type: 'string', description: '提取出该业务指令的原始用户聊天消息内容' }
    },
    required: ['groupId', 'buyer', 'itemName', 'quantity', 'confidence', 'rawMessage']
  },
  execute: async (toolCallId: string, args: any) => {
    await db.insert(orders).values({
      groupId: args.groupId,
      buyer: args.buyer,
      itemName: args.itemName,
      quantity: -Math.abs(args.quantity), // 确保退货数量是负数
      confidence: args.confidence,
      rawMessage: args.rawMessage,
      type: 'RETURN',
      status: 'PENDING'
    });
    
    const result = { status: 'success', message: '退货记录已成功写入待复核库' };
    return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
  }
};

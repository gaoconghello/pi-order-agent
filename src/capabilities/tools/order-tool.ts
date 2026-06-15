import { db } from '../store/db';
import { orders } from '../store/schema';

export const orderTool = {
  name: 'record_order',
  label: 'record_order',
  description: '当群成员明确表达购买、下单、加单或修改订单意图时调用此工具。',
  parameters: {
    type: 'object',
    properties: {
      groupId: { type: 'string', description: '微信群唯一ID' },
      buyer: { type: 'string', description: '下单人的微信昵称' },
      itemName: { type: 'string', description: '商品名称或品类' },
      quantity: { type: 'number', description: '最终的数量变化，加单为正数，减单/改单为调整后的绝对数' },
      confidence: { type: 'string', enum: ['HIGH', 'PENDING_REVIEW'], description: '如果语义模糊或存在多人口径不一致，务必传 PENDING_REVIEW' },
      rawMessage: { type: 'string', description: '提取出该业务指令的原始用户聊天消息内容' }
    },
    required: ['groupId', 'buyer', 'itemName', 'quantity', 'confidence', 'rawMessage']
  },
  execute: async (toolCallId: string, args: any) => {
    console.log("TOOL CALLED with args:", args);
    await db.insert(orders).values({
      groupId: args.groupId,
      buyer: args.buyer,
      itemName: args.itemName,
      quantity: args.quantity,
      confidence: args.confidence,
      rawMessage: args.rawMessage,
      type: 'ORDER',
      status: 'PENDING'
    });
    
    const result = { status: 'success', message: '订单已成功写入待复核库' };
    return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
  }
};

import { db } from '../store/db';
import { priceRules } from '../store/schema';

export const priceChangeTool = {
  name: 'record_price_change',
  label: 'record_price_change',
  description: '当群成员或老板确认商品价格变动或设定特定协议价时调用此工具。',
  parameters: {
    type: 'object',
    properties: {
      groupId: { type: 'string', description: '微信群唯一ID' },
      itemName: { type: 'string', description: '商品名称或品类' },
      agreedPrice: { type: 'number', description: '变动后或协议的新价格' },
      rawMessage: { type: 'string', description: '提取出该业务指令的原始聊天消息内容' }
    },
    required: ['groupId', 'itemName', 'agreedPrice', 'rawMessage']
  },
  execute: async (toolCallId: string, args: any) => {
    await db.insert(priceRules).values({
      groupId: args.groupId,
      itemName: args.itemName,
      agreedPrice: args.agreedPrice,
    });
    
    const result = { status: 'success', message: '价格变动记录已成功生效' };
    return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
  }
};

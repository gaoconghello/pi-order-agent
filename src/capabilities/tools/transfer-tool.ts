import { db } from '../store/db';
import { transactions } from '../store/schema';

export const transferTool = {
  name: 'record_transfer',
  label: 'record_transfer',
  description: '当群成员发送转账、付款截图或明确表示已打款时调用此工具。',
  parameters: {
    type: 'object',
    properties: {
      groupId: { type: 'string', description: '微信群唯一ID' },
      sender: { type: 'string', description: '付款人的微信昵称' },
      amount: { type: 'number', description: '转账金额' },
      confidence: { type: 'string', enum: ['HIGH', 'PENDING_REVIEW'], description: '如果无法精确提取金额，务必传 PENDING_REVIEW' },
      rawMessage: { type: 'string', description: '提取出该业务指令的原始用户聊天消息内容' }
    },
    required: ['groupId', 'sender', 'amount', 'confidence', 'rawMessage']
  },
  execute: async (toolCallId: string, args: any) => {
    await db.insert(transactions).values({
      groupId: args.groupId,
      sender: args.sender,
      amount: args.amount,
      confidence: args.confidence,
      rawMessage: args.rawMessage,
      status: 'UNVERIFIED'
    });
    
    const result = { status: 'success', message: '转账记录已成功写入待核对库' };
    return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
  }
};

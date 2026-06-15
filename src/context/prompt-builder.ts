import { promises as fs } from 'fs';

export async function buildSystemPrompt(groupId: string): Promise<string> {
  const businessMd = await fs.readFile("src/context/business.md", "utf-8").catch(() => "行业知识为空。");
  const roleMd = await fs.readFile("src/context/role.md", "utf-8").catch(() => "角色设定为空。");
  
  let groupMemory = "";
  try {
    groupMemory = await fs.readFile(`src/context/groups/${groupId}.md`, "utf-8");
  } catch {
    groupMemory = "该群无特殊策略，按行业常识处理。";
  }

  return `
${businessMd}

${roleMd}

### 当前群组上下文及画像历史
${groupMemory}
`;
}

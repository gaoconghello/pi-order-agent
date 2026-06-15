import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const toolsDir = join(import.meta.dir, 'src', 'capabilities', 'tools');
const files = readdirSync(toolsDir);

for (const file of files) {
  if (!file.endsWith('.ts')) continue;
  const filePath = join(toolsDir, file);
  let content = readFileSync(filePath, 'utf-8');
  
  // Remove ToolRegistry import
  content = content.replace(/import \{ ToolRegistry \} from '\.\.\/\.\.\/core\/registry';\n?/g, '');
  
  // Extract file name without extension to create camelCase tool name
  const nameParts = file.replace('.ts', '').split('-');
  const varName = nameParts[0] + nameParts.slice(1).map(p => p[0].toUpperCase() + p.slice(1)).join('') + 'Tool';

  // Replace ToolRegistry.register({ with export const varName = {
  content = content.replace(/ToolRegistry\.register\(\{/g, `export const ${varName} = {`);
  
  writeFileSync(filePath, content, 'utf-8');
}
console.log('Tools updated');

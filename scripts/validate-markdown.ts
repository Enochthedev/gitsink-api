import { ParserService } from '../src/parser/parser.service';
import { promises as fs } from 'fs';

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: validate-markdown <file>');
    process.exit(1);
  }

  try {
    const contents = await fs.readFile(file, 'utf8');
    const parser = new ParserService();
    parser.parseMarkdown(contents);
    console.log(`${file} is valid`);
  } catch (err) {
    console.error(`Validation failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

void main();


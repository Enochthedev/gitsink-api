import { Injectable } from '@nestjs/common';
import matter from 'gray-matter';
import {
  PortfolioMetadataSchema,
  PortfolioMetadata,
} from './types/portfolio.schema';

@Injectable()
export class ParserService {
  parseMarkdown(md: string): PortfolioMetadata {
    const parsedMatter = matter(md);
    const rawData = {
      ...parsedMatter.data,
      body: parsedMatter.content.trim(),
    };

    const result = PortfolioMetadataSchema.safeParse(rawData);

    if (!result.success) {
      throw new Error(`Invalid Portfolio.md format: ${result.error.message}`);
    }

    return result.data;
  }
}

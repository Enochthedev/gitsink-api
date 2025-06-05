import { Injectable } from '@nestjs/common';
import matter from 'gray-matter';
import { PortfolioMetadataSchema } from './types/portfolio.schema';
import { ParseResult } from './types/portfolio.types';

@Injectable()
export class ParserService {
  parseMarkdown(md: string): ParseResult {
    const parsedMatter = matter(md);
    const rawData = {
      ...parsedMatter.data,
      body: parsedMatter.content.trim(),
    };

    const result = PortfolioMetadataSchema.safeParse(rawData);

    if (!result.success) {
      return {
        valid: false,
        errors: result.error.errors.map((e) => e.message),
      };
    }

    return { valid: true, data: result.data };
  }
}

import { Injectable } from '@nestjs/common';
import * as matter from 'gray-matter';
import { PortfolioMetadata } from './types/portfolio.types';

@Injectable()
export class ParserService {
  parseMarkdown(md: string): PortfolioMetadata {
    const { data, content } = matter(md);

    return {
      ...data,
      body: content.trim(),
    } as PortfolioMetadata;
  }
}

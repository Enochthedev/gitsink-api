import { Injectable } from '@nestjs/common';
import { ParserService } from './parser/parser.service';
import { PortfolioMetadata } from './parser/types/portfolio.schema';

@Injectable()
export class AppService {
  constructor(private readonly parser: ParserService) {}

  getHello(): PortfolioMetadata {
    const testMd = `---
title: "Test Project"
description: "Just testing."
tags: ["test"]
---

Some more body content.`;

    return this.parser.parseMarkdown(testMd);
  }
}

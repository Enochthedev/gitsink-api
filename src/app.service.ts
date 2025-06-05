import { Injectable } from '@nestjs/common';
import { ParserService } from './parser/parser.service';
import { ParseResult } from './parser/types/portfolio.types';

@Injectable()
export class AppService {
  constructor(private readonly parser: ParserService) {}

  getHello(): ParseResult {
    const testMd = `---
title: "Test Project"
description: "Just testing."
tags: ["test"]
---

Some more body content.`;

    return this.parser.parseMarkdown(testMd);
  }
}

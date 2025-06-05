import { Test, TestingModule } from '@nestjs/testing';
import { ParserService } from './parser.service';

describe('ParserService', () => {
  let service: ParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ParserService],
    }).compile();

    service = module.get<ParserService>(ParserService);
  });

  it('should correctly parse valid markdown', () => {
    const md = `---
title: "Test Project"
description: "Just testing."
tags: ["test"]
---

Some more body content.`;
    const result = service.parseMarkdown(md);
    expect(result).toEqual({
      title: 'Test Project',
      description: 'Just testing.',
      tags: ['test'],
      body: 'Some more body content.',
    });
  });

  it('should throw an error for invalid front matter', () => {
    const md = `---
title: 123
---
Invalid body`;
    expect(() => service.parseMarkdown(md)).toThrowError(
      /Invalid Portfolio.md format/,
    );
  });
});

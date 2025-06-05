import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect(); // ✅ now TS knows type, ESLint will shut up
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AutoBlogShopifyCommand } from './commands/auto-blog.shopify/auto-blog.shopify.command';

@Module({
  imports: [HttpModule],
  providers: [AutoBlogShopifyCommand],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AutoBlogShopifyCommand } from './commands/auto-blog.shopify/auto-blog.shopify.command';
import { TiktokMessageCommand } from './commands/tiktok-message/tiktok-message.command';

@Module({
  imports: [HttpModule],
  providers: [AutoBlogShopifyCommand, TiktokMessageCommand],
})
export class AppModule {}

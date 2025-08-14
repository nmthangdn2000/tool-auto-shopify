import { HttpService } from '@nestjs/axios';
import { Command, CommandRunner } from 'nest-commander';
import { readFileSync, writeFileSync } from 'fs';
import { launchBrowser } from '../../utils/browser.util';
import { FrameLocator, Locator, Page } from 'playwright-core';
import { retry } from '../../utils/common.util';

type DataJson = {
  user_id: string;
  user_follows: {
    uniqueId: string;
    nickname: string;
    id: string;
    chatted: boolean;
  }[];
};

type ScrollOptions = {
  wait?: number;
  stableRounds?: number;
  maxRounds?: number;
  itemSelector?: string;
};

type ScrollResult = {
  rounds: number;
  lastHeight: number;
  stoppedBecause: 'maxRounds' | 'stable';
};

@Command({
  name: 'tiktok-message',
  description: 'Tiktok message',
  arguments: '<file-data>',
})
export class TiktokMessageCommand extends CommandRunner {
  private isWriting = false;
  private writeQueue: DataJson['user_follows'] = [];

  constructor(private readonly httpService: HttpService) {
    super();
  }

  async run(inputs: string[]) {
    const pathFileSetting = inputs[0];
    const dataJson = JSON.parse(
      readFileSync(pathFileSetting, 'utf8'),
    ) as DataJson;

    const message = readFileSync(inputs[1], 'utf8');

    if (!message) {
      console.log('Message file not found');
      return;
    }

    const browser = await launchBrowser(true);

    try {
      const page = await browser.newPage();

      await page.goto('https://www.tiktok.com', {
        waitUntil: 'domcontentloaded',
      });

      const currentUrl = page.url();
      const loginContainer = await page
        .locator('div[id="loginContainer"]')
        .isVisible({
          timeout: 10000,
        });
      const isLoggedIn = currentUrl.includes('login') || !loginContainer;

      if (!isLoggedIn) {
        console.log('Please login to TikTok');
        throw new Error('Please set show_browser to true to login to TikTok');
      }

      await this.handleSendMessage(page, dataJson, message, pathFileSetting);

      await page.locator('a[data-e2e="nav-profile"] button').click();

      console.log('Getting followers');
      await this.getFollowers(page, pathFileSetting);

      await this.handleSendMessage(
        page,
        JSON.parse(readFileSync(pathFileSetting, 'utf8')) as DataJson,
        message,
        pathFileSetting,
      );

      console.log('Done');
    } catch (error) {
      console.log(error);
    } finally {
      await browser.close();
    }
  }

  private async handleSendMessage(
    page: Page,
    dataJson: DataJson,
    message: string,
    pathFileSetting: string,
  ) {
    const userNotChatted = dataJson.user_follows.filter((u) => !u.chatted);

    if (userNotChatted.length > 0) {
      console.log('Sending message to', userNotChatted.length, 'users');
      await this.message(page, dataJson, message, pathFileSetting);
    }
  }

  private async getFollowers(page: Page, pathFileSetting: string) {
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/user/list/')) {
        const res = (await response.json()) as {
          userList: {
            user: {
              uniqueId: string;
              nickname: string;
              id: string;
            };
          }[];
        };

        if (!res || !res.userList) return;

        const data = res.userList.map((user) => ({
          uniqueId: user.user.uniqueId,
          nickname: user.user.nickname,
          id: user.user.id,
          chatted: false,
        }));

        this.writeQueue.push(...data);
        this.processWriteQueue(pathFileSetting);
      }
    });

    await page.locator('[data-e2e="followers-count"]').click();

    const dialog = page.locator(
      'div[role="dialog"][data-e2e="follow-info-popup"]',
    );
    const followerContainer = dialog.locator('> div').nth(2);
    const { rounds, lastHeight, stoppedBecause } =
      await this.scrollUntilNoMore(followerContainer);
    console.log(rounds, lastHeight, stoppedBecause);
  }

  private async message(
    page: Page,
    dataJson: DataJson,
    message: string,
    pathFileSetting: string,
  ) {
    for (const user of dataJson.user_follows) {
      if (user.chatted) continue;

      await retry(async () => {
        await page.goto(`https://www.tiktok.com/messages?lang=en&u=${user.id}`);
        // await page.goto(
        //   `https://www.tiktok.com/messages?from=homepage&lang=en&u=7277192393706324999`,
        // );

        let frameContext: Page | FrameLocator;

        const iframe = await page.$(`iframe[src*="${user.id}"]`);

        if (iframe) {
          frameContext = page.frameLocator(`iframe[src*="${user.id}"]`);
        } else {
          frameContext = page;
        }

        const input = frameContext.locator('div[contenteditable="true"]');
        await input.waitFor({
          state: 'visible',
        });
        await input.click();
        await page.waitForTimeout(1000);
        await page.keyboard.type(message);

        await frameContext.locator('svg[data-e2e="message-send"]').click();

        user.chatted = true;
        writeFileSync(pathFileSetting, JSON.stringify(dataJson, null, 2));

        console.log(`Message sent to ${user.nickname}`);
      });
    }
  }

  private async scrollUntilNoMore(
    container: Locator,
    { wait = 1000, stableRounds = 3, maxRounds = 200 }: ScrollOptions = {},
  ): Promise<ScrollResult> {
    let stable = 0;
    let lastHeight = -1;
    let rounds = 0;
    let stoppedBecause: 'maxRounds' | 'stable' = 'stable';

    for (; rounds < maxRounds && stable < stableRounds; rounds++) {
      const h = await container.evaluate((el) => {
        el.scrollTo(0, el.scrollHeight);
        return el.scrollHeight;
      });

      await container.page().waitForTimeout(wait);

      const newH = await container.evaluate((el) => el.scrollHeight);
      lastHeight = newH;
      stable = newH === h ? stable + 1 : 0;
    }

    if (rounds >= maxRounds) {
      stoppedBecause = 'maxRounds';
    }

    return { rounds, lastHeight, stoppedBecause };
  }

  private processWriteQueue(pathFileSetting: string) {
    if (this.isWriting || this.writeQueue.length === 0) return;
    this.isWriting = true;

    try {
      const dataJson = JSON.parse(
        readFileSync(pathFileSetting, 'utf8'),
      ) as DataJson;

      const existedIds = new Set(dataJson.user_follows.map((u) => u.uniqueId));
      const newItems = this.writeQueue.filter(
        (u) => !existedIds.has(u.uniqueId),
      );
      this.writeQueue.length = 0; // clear queue
      console.log('newItems', newItems.length);

      if (newItems.length > 0) {
        dataJson.user_follows.push(...newItems);
        writeFileSync(pathFileSetting, JSON.stringify(dataJson, null, 2));
      }
    } finally {
      this.isWriting = false;
    }
  }
}

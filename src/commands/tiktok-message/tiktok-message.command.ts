import { HttpService } from '@nestjs/axios';
import { Command, CommandRunner } from 'nest-commander';
import {
  readFileSync,
  writeFileSync,
  createWriteStream,
  createReadStream,
} from 'fs';
import { launchBrowser } from '../../utils/browser.util';
import { FrameLocator, Locator, Page } from 'playwright-core';
import { retry } from '../../utils/common.util';
import { parse, format } from 'fast-csv';

type DataJson = {
  user_id: string;
  is_close_browser: boolean;
};

type UserFollow = {
  uniqueId: string;
  nickname: string;
  id: string;
  chatted: boolean;
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
  arguments: '<file-data> <message-file> <user-follow-csv>',
})
export class TiktokMessageCommand extends CommandRunner {
  private isWriting = false;
  private writeQueue: UserFollow[] = [];

  constructor(private readonly httpService: HttpService) {
    super();
  }

  async run(inputs: string[]) {
    const pathFileSetting = inputs[0];
    const messageFile = inputs[1];
    const userFollowCsvFile = inputs[2];

    const dataJson = JSON.parse(
      readFileSync(pathFileSetting, 'utf8'),
    ) as DataJson;

    const message = readFileSync(messageFile, 'utf8');

    if (!message) {
      console.log('Message file not found');
      return;
    }

    // Read user follows from CSV
    const userFollows = await this.readUserFollowsFromCsv(userFollowCsvFile);

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

      await this.handleSendMessage(
        page,
        userFollows,
        message,
        userFollowCsvFile,
      );

      await page.locator('a[data-e2e="nav-profile"] button').click();

      console.log('Getting followers');
      await this.getFollowers(page, userFollowCsvFile);

      // Re-read user follows after getting new followers
      const updatedUserFollows =
        await this.readUserFollowsFromCsv(userFollowCsvFile);
      await this.handleSendMessage(
        page,
        updatedUserFollows,
        message,
        userFollowCsvFile,
      );

      console.log('Done');
    } catch (error) {
      console.log(error);
    } finally {
      if (dataJson.is_close_browser) {
        await browser.close();
      }
    }
  }

  private async readUserFollowsFromCsv(csvFile: string): Promise<UserFollow[]> {
    return new Promise((resolve) => {
      const userFollows: UserFollow[] = [];

      // Kiểm tra xem file có tồn tại và có header không
      try {
        const fileContent = readFileSync(csvFile, 'utf8').trim();

        // Nếu file rỗng hoặc không có header, tạo header
        if (
          !fileContent ||
          !fileContent.includes('uniqueId,nickname,id,chatted')
        ) {
          console.log('Creating CSV header for file:', csvFile);
          writeFileSync(csvFile, 'uniqueId,nickname,id,chatted\n');
          resolve(userFollows);
          return;
        }

        createReadStream(csvFile)
          .pipe(parse({ headers: true }))
          .on('data', (row: any) => {
            const userRow = row as Record<string, string>;
            userFollows.push({
              uniqueId: String(userRow.uniqueId || ''),
              nickname: String(userRow.nickname || ''),
              id: String(userRow.id || ''),
              chatted: String(userRow.chatted || 'false') === 'true',
            });
          })
          .on('end', () => resolve(userFollows))
          .on('error', () => {
            console.log('Error reading CSV, creating new file with header');
            writeFileSync(csvFile, 'uniqueId,nickname,id,chatted\n');
            resolve(userFollows);
          });
      } catch {
        // Nếu file không tồn tại, tạo file mới với header
        console.log(
          'File not found, creating new CSV file with header:',
          csvFile,
        );
        writeFileSync(csvFile, 'uniqueId,nickname,id,chatted\n');
        resolve(userFollows);
      }
    });
  }

  private async writeUserFollowsToCsv(
    csvFile: string,
    userFollows: UserFollow[],
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const csvStream = format({ headers: true });
      const writeStream = createWriteStream(csvFile);

      csvStream.pipe(writeStream);

      userFollows.forEach((user) => {
        csvStream.write({
          uniqueId: user.uniqueId,
          nickname: user.nickname,
          id: user.id,
          chatted: user.chatted.toString(),
        });
      });

      csvStream.end();
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
  }

  private async handleSendMessage(
    page: Page,
    userFollows: UserFollow[],
    message: string,
    csvFile: string,
  ) {
    const userNotChatted = userFollows.filter((u) => !u.chatted);

    if (userNotChatted.length > 0) {
      console.log('Sending message to', userNotChatted.length, 'users');
      await this.message(page, userFollows, message, csvFile);
    }
  }

  private async getFollowers(page: Page, csvFile: string) {
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
        await this.processWriteQueue(csvFile);
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
    userFollows: UserFollow[],
    message: string,
    csvFile: string,
  ) {
    for (const user of userFollows) {
      if (user.chatted) continue;

      await retry(async () => {
        await page.goto(`https://www.tiktok.com/messages?lang=en&u=${user.id}`);
        // await page.goto(
        //   `https://www.tiktok.com/messages?from=homepage&lang=en&u=7277192393706324999`,
        // );

        let frameContext: Page | FrameLocator = page;

        if (page.url().includes('business-suite')) {
          const iframe = page.locator(`iframe[src*="${user.id}"]`);
          await iframe.waitFor({ state: 'visible', timeout: 2 * 60 * 1000 });

          frameContext = page.frameLocator(`iframe[src*="${user.id}"]`);
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
        await this.writeUserFollowsToCsv(csvFile, userFollows);

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

  private async processWriteQueue(csvFile: string) {
    if (this.isWriting || this.writeQueue.length === 0) return;
    this.isWriting = true;

    try {
      const existingUserFollows = await this.readUserFollowsFromCsv(csvFile);
      const existedIds = new Set(existingUserFollows.map((u) => u.uniqueId));
      const newItems = this.writeQueue.filter(
        (u) => !existedIds.has(u.uniqueId),
      );
      this.writeQueue.length = 0; // clear queue
      console.log('newItems', newItems.length);

      if (newItems.length > 0) {
        const updatedUserFollows = [...existingUserFollows, ...newItems];
        await this.writeUserFollowsToCsv(csvFile, updatedUserFollows);
      }
    } finally {
      this.isWriting = false;
    }
  }
}

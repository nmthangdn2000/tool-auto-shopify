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
  private messagesThisMinute = 0;
  private lastMessageTime = 0;

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

  private async checkMinuteLimit(): Promise<boolean> {
    const now = Date.now();

    // Reset counter if it's been more than a minute
    if (now - this.lastMessageTime > 60000) {
      this.messagesThisMinute = 0;
    }

    // Check if we've sent too many messages this minute
    if (this.messagesThisMinute >= 4) {
      const waitTime = 60000 - (now - this.lastMessageTime);
      if (waitTime > 0) {
        console.log(
          `Rate limit reached (4 messages/minute). Waiting ${Math.ceil(waitTime / 1000)} seconds...`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        this.messagesThisMinute = 0;
      }
    }

    return true;
  }

  private getRandomDelay(): number {
    // Random delay between 20-40 seconds
    const minDelay = 20000; // 20 seconds
    const maxDelay = 40000; // 40 seconds
    return Math.random() * (maxDelay - minDelay) + minDelay;
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

      // Check rate limit before sending
      await this.checkMinuteLimit();

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

        // Thực hiện một số click ngẫu nhiên để tạo hiệu ứng tự nhiên
        const randomClicks = Math.floor(Math.random() * 5) + 2; // 2-6 clicks
        for (let i = 0; i < randomClicks; i++) {
          await this.naturalClickInMainContentArea(
            page,
            Math.random() * 0.8 + 0.1, // X: 0.1-0.9
            Math.random() * 0.6 + 0.2, // Y: 0.2-0.8 (tránh vùng trên và dưới)
            {
              headerHeight: 200,
              sidebarWidth: 450,
              bottomHeight: 120,
              preClickDelay: Math.random() * 200 + 100, // 100-300ms
              postClickDelay: Math.random() * 150 + 50, // 50-200ms
            },
          );
          await page.waitForTimeout(Math.random() * 500 + 200); // Chờ 200-700ms giữa các click
        }

        await input.click();
        await page.waitForTimeout(1000);

        // Tách message thành nhiều đoạn nếu có \n và gửi từng đoạn
        const messageParts = message
          .split('\n')
          .filter((part) => part.trim() !== '');

        for (let i = 0; i < messageParts.length; i++) {
          const part = messageParts[i].trim();
          if (part) {
            await page.keyboard.type(part);
            await page.waitForTimeout(Math.random() * 500 + 300);

            // Gửi message này
            await frameContext.locator('svg[data-e2e="message-send"]').click();
            await page.waitForTimeout(Math.random() * 1000 + 1000);

            // Nếu còn đoạn tiếp theo, click lại vào input để chuẩn bị gửi đoạn tiếp
            if (i < messageParts.length - 1) {
              await input.click();
              await page.waitForTimeout(500);
            }
          }
        }

        user.chatted = true;
        await this.writeUserFollowsToCsv(csvFile, userFollows);

        // Update rate limit counters
        this.messagesThisMinute++;
        this.lastMessageTime = Date.now();

        console.log(
          `Message sent to ${user.nickname} (${this.messagesThisMinute}/4 this minute)`,
        );

        // Add random delay between messages
        const delay = this.getRandomDelay();
        console.log(
          `Waiting ${Math.ceil(delay / 1000)} seconds before next message...`,
        );
        await page.waitForTimeout(delay);
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

  /**
   * Click trong vùng bỏ header ở trên và sidebar
   * @param page - Playwright page object
   * @param x - Tọa độ x tương đối (0-1)
   * @param y - Tọa độ y tương đối (0-1)
   * @param options - Tùy chọn bổ sung
   */
  private async clickInMainContentArea(
    page: Page,
    x: number = 0.5,
    y: number = 0.5,
    options: {
      headerHeight?: number;
      sidebarWidth?: number;
      bottomHeight?: number;
      delay?: number;
      button?: 'left' | 'right' | 'middle';
      clickCount?: number;
    } = {},
  ) {
    const {
      headerHeight = 80, // Chiều cao header mặc định (px)
      sidebarWidth = 240, // Chiều rộng sidebar mặc định (px)
      bottomHeight = 120, // Chiều cao bottom (input chat) mặc định (px)
      delay = 100,
      button = 'left',
      clickCount = 1,
    } = options;

    try {
      // Lấy kích thước viewport
      const viewport = page.viewportSize();
      if (!viewport) {
        throw new Error('Không thể lấy kích thước viewport');
      }

      const { width: viewportWidth, height: viewportHeight } = viewport;

      // Tính toán vùng click an toàn (bỏ header, sidebar và bottom)
      const safeAreaX = sidebarWidth + (viewportWidth - sidebarWidth) * x;
      const safeAreaY =
        headerHeight + (viewportHeight - headerHeight - bottomHeight) * y;

      // Đảm bảo tọa độ nằm trong vùng an toàn
      const finalX = Math.max(
        sidebarWidth + 10,
        Math.min(viewportWidth - 10, safeAreaX),
      );
      const finalY = Math.max(
        headerHeight + 10,
        Math.min(viewportHeight - bottomHeight - 10, safeAreaY),
      );

      console.log(
        `Clicking at position: (${Math.round(finalX)}, ${Math.round(finalY)})`,
      );
      console.log(
        `Safe area: X from ${sidebarWidth} to ${viewportWidth}, Y from ${headerHeight} to ${viewportHeight - bottomHeight}`,
      );

      // Thực hiện click như chuột thật (mousedown + mouseup)
      await page.mouse.move(finalX, finalY);
      await page.waitForTimeout(50); // Chờ một chút trước khi click
      await page.mouse.down({ button });
      await page.waitForTimeout(delay);
      await page.mouse.up({ button });

      // Nếu cần click nhiều lần
      if (clickCount > 1) {
        for (let i = 1; i < clickCount; i++) {
          await page.waitForTimeout(100);
          await page.mouse.down({ button });
          await page.waitForTimeout(delay);
          await page.mouse.up({ button });
        }
      }

      return { x: finalX, y: finalY };
    } catch (error) {
      console.error('Lỗi khi click trong vùng main content:', error);
      return false;
    }
  }

  /**
   * Click ngẫu nhiên trong vùng main content
   * @param page - Playwright page object
   * @param options - Tùy chọn bổ sung
   */
  private async clickRandomInMainContentArea(
    page: Page,
    options: {
      headerHeight?: number;
      sidebarWidth?: number;
      bottomHeight?: number;
      minX?: number;
      maxX?: number;
      minY?: number;
      maxY?: number;
      delay?: number;
    } = {},
  ) {
    const {
      headerHeight = 200,
      sidebarWidth = 450,
      bottomHeight = 120,
      minX = 0.1,
      maxX = 0.9,
      minY = 0.1,
      maxY = 0.9,
      delay = 100,
    } = options;

    // Tạo tọa độ ngẫu nhiên trong vùng an toàn
    const randomX = Math.random() * (maxX - minX) + minX;
    const randomY = Math.random() * (maxY - minY) + minY;

    return await this.clickInMainContentArea(page, randomX, randomY, {
      headerHeight,
      sidebarWidth,
      bottomHeight,
      delay,
    });
  }

  /**
   * Click vào một element cụ thể trong vùng main content
   * @param page - Playwright page object
   * @param selector - CSS selector của element
   * @param options - Tùy chọn bổ sung
   */
  private async clickElementInMainContentArea(
    page: Page,
    selector: string,
    options: {
      headerHeight?: number;
      sidebarWidth?: number;
      bottomHeight?: number;
      timeout?: number;
      force?: boolean;
    } = {},
  ) {
    const {
      headerHeight = 80,
      sidebarWidth = 240,
      bottomHeight = 120,
      timeout = 10000,
      force = false,
    } = options;

    try {
      // Tìm element
      const element = page.locator(selector);
      await element.waitFor({ state: 'visible', timeout });

      // Lấy vị trí của element
      const boundingBox = await element.boundingBox();
      if (!boundingBox) {
        throw new Error(`Không thể lấy vị trí của element: ${selector}`);
      }

      // Kiểm tra xem element có nằm trong vùng an toàn không
      const viewport = page.viewportSize();
      if (!viewport) {
        throw new Error('Không thể lấy kích thước viewport');
      }

      const { width: viewportWidth, height: viewportHeight } = viewport;

      // Tính toán vị trí click (center của element)
      const elementCenterX = boundingBox.x + boundingBox.width / 2;
      const elementCenterY = boundingBox.y + boundingBox.height / 2;

      // Kiểm tra xem element có nằm trong vùng an toàn không
      const isInSafeArea =
        elementCenterX > sidebarWidth &&
        elementCenterX < viewportWidth &&
        elementCenterY > headerHeight &&
        elementCenterY < viewportHeight - bottomHeight;

      if (!isInSafeArea && !force) {
        console.warn(
          `Element ${selector} không nằm trong vùng an toàn. Vị trí: (${elementCenterX}, ${elementCenterY})`,
        );
        return false;
      }

      // Click vào element với hiệu ứng tự nhiên
      await element.click({ timeout, force });
      console.log(
        `Clicked element: ${selector} at (${Math.round(elementCenterX)}, ${Math.round(elementCenterY)})`,
      );

      return true;
    } catch (error) {
      console.error(`Lỗi khi click element ${selector}:`, error);
      return false;
    }
  }

  /**
   * Click tự nhiên với hiệu ứng di chuyển chuột từ vị trí hiện tại
   * @param page - Playwright page object
   * @param x - Tọa độ x tương đối (0-1)
   * @param y - Tọa độ y tương đối (0-1)
   * @param options - Tùy chọn bổ sung
   */
  private async naturalClickInMainContentArea(
    page: Page,
    x: number = 0.5,
    y: number = 0.5,
    options: {
      headerHeight?: number;
      sidebarWidth?: number;
      bottomHeight?: number;
      preClickDelay?: number;
      postClickDelay?: number;
      button?: 'left' | 'right' | 'middle';
    } = {},
  ) {
    const {
      headerHeight = 200,
      sidebarWidth = 450,
      bottomHeight = 120,
      preClickDelay = 100, // Thời gian chờ trước khi click
      postClickDelay = 50, // Thời gian chờ sau khi click
      button = 'left',
    } = options;

    try {
      // Lấy kích thước viewport
      const viewport = page.viewportSize();
      if (!viewport) {
        throw new Error('Không thể lấy kích thước viewport');
      }

      const { width: viewportWidth, height: viewportHeight } = viewport;

      // Tính toán vùng click an toàn
      const safeAreaX = sidebarWidth + (viewportWidth - sidebarWidth) * x;
      const safeAreaY =
        headerHeight + (viewportHeight - headerHeight - bottomHeight) * y;

      // Đảm bảo tọa độ nằm trong vùng an toàn
      const finalX = Math.max(
        sidebarWidth + 10,
        Math.min(viewportWidth - 10, safeAreaX),
      );
      const finalY = Math.max(
        headerHeight + 10,
        Math.min(viewportHeight - bottomHeight - 10, safeAreaY),
      );

      console.log(
        `Natural clicking at position: (${Math.round(finalX)}, ${Math.round(finalY)})`,
      );

      // Di chuyển chuột từ vị trí hiện tại đến vị trí đích
      await page.mouse.move(finalX, finalY, { steps: 10 });

      // Chờ một chút trước khi click
      await page.waitForTimeout(preClickDelay);

      // Thực hiện click tự nhiên
      await page.mouse.down({ button });
      await page.waitForTimeout(50); // Thời gian giữ chuột
      await page.mouse.up({ button });

      // Chờ sau khi click
      await page.waitForTimeout(postClickDelay);

      return { x: finalX, y: finalY };
    } catch (error) {
      console.error('Lỗi khi thực hiện natural click:', error);
      return false;
    }
  }
}

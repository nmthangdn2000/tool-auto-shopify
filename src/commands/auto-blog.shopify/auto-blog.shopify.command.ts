import { HttpService } from '@nestjs/axios';
import { Command, CommandRunner } from 'nest-commander';
import { launchBrowser } from '../../utils/browser.util';
import { BrowserContext, Page } from 'playwright-core';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { promptFinal } from './prompt';
import { retry, sleep } from '../../utils/common.util';
import { lastValueFrom } from 'rxjs';

type DataJson = {
  prompt: string;
  blogs: {
    url: string;
    url_blog: string | null;
  }[];
};

type JsonChatGPT = {
  title: string;
  [key: string]: any;
};

@Command({
  name: 'auto-blog-shopify',
  description: 'Auto blog shopify',
  arguments: '<file-data>',
})
export class AutoBlogShopifyCommand extends CommandRunner {
  constructor(private readonly httpService: HttpService) {
    super();
  }

  async run(inputs: string[]) {
    const pathFileSetting = inputs[0];
    const dataJson = JSON.parse(
      readFileSync(pathFileSetting, 'utf8'),
    ) as DataJson;

    const browser = await launchBrowser(true);

    try {
      for (const blog of dataJson.blogs) {
        if (blog.url_blog) continue;
        try {
          const {
            page: pageChatGPT,
            images,
            json,
          } = await this.getBlogInChatGPT(browser, blog.url, dataJson.prompt);
          const { page: pageShopify, url_blog } = await this.setUpBlogGenerate(
            browser,
            images,
            json,
          );

          blog.url_blog = url_blog;

          // save dataJson
          writeFileSync(
            join(__dirname, 'data.json'),
            JSON.stringify(dataJson, null, 2),
          );

          await pageShopify.close();
          await pageChatGPT.close();
        } catch (error) {
          if (error instanceof PublishBlogError) {
            console.log('💥 Lỗi xuất hiện:', (error as Error).message);
          } else {
            throw error;
          }
        }
      }
      // const page = await browser.newPage();
      // await page.goto(
      //   'https://admin.shopify.com/store/the-rike-inc/content/articles/686868169022',
      //   {
      //     waitUntil: 'networkidle',
      //   },
      // );

      // await this.publicBlog(page, [
      //   'https://blog.thompson-morgan.com/wp-content/uploads/2014/09/TM-amarantus-feature.jpg',
      //   'https://survivalgardenseeds.com/cdn/shop/articles/Amaranth-top_2c86e805-3d8a-4c0c-8deb-c81abcf2f8b1.jpg?v=1739601696&width=1600',
      //   'https://www.thespruce.com/thmb/1NhtaELj6ByengoqDFe9nlPifrY%3D/3000x0/filters%3Ano_upscale%28%29%3Amax_bytes%28150000%29%3Astrip_icc%28%29/growing-an-edible-amaranth-harvest-3954015-hero-cf9221d8ddc54e57b751686845ea6f51.jpg',
      //   'https://www.almanac.com/sites/default/files/images/amaranth%20red%20bloom.jpg',
      // ]);
    } catch (error) {
      console.log('💥 Lỗi xuất hiện:', error);
    } finally {
      await browser.close();
    }
  }

  private async getBlogInChatGPT(
    context: BrowserContext,
    url: string,
    prompt: string,
  ) {
    const page = await context.newPage();
    await page.goto('https://chatgpt.com', {
      waitUntil: 'networkidle',
      timeout: 1000 * 60 * 1,
    });

    const promptSelector = '#prompt-textarea';

    await page.waitForSelector(promptSelector, {
      state: 'visible',
    });

    await page.fill(
      promptSelector,
      promptFinal(prompt).replace('{{URL_BLOG}}', url),
    );
    await page.waitForTimeout(1000);
    await page.keyboard.press('Enter');

    await retry(async () => {
      await this.waitOneOf(page);
    });

    await sleep(1000);

    const articles = await page.$$('article[data-testid^="conversation-turn"]');
    if (articles.length === 0) {
      throw new Error('❌ Không tìm thấy article nào.');
    }

    const lastArticle = articles[articles.length - 1];

    const code = await lastArticle.$('code');
    let json = await code?.evaluate((el) => el.textContent);
    if (!json) {
      json = await lastArticle.evaluate(
        (el) => el.querySelector('p')?.textContent,
      );
    }

    console.log(json);

    const jsonObject = JSON.parse(json as string) as JsonChatGPT;
    console.log(jsonObject);

    const imgs = await lastArticle.$$('img');
    let srcs = await Promise.all(imgs.map((img) => img.getAttribute('src')));
    console.log(srcs);

    if (srcs.length === 0) {
      await page.click(promptSelector);
      await page.fill(
        promptSelector,
        `And you must show me a maximum of 4 relevant images from this article, no images that look like the logo: ${url}`,
      );
      await page.waitForTimeout(1000);
      await page.keyboard.press('Enter');

      await retry(async () => {
        await this.waitOneOf(page);
      });

      await sleep(1000);

      const newArticles = await page.$$(
        'article[data-testid^="conversation-turn"]',
      );
      if (newArticles.length === 0) {
        throw new Error('❌ Không tìm thấy article nào.');
      }

      const newLastArticle = newArticles[newArticles.length - 1];
      const imgs = await newLastArticle.$$('img');
      srcs = await Promise.all(imgs.map((img) => img.getAttribute('src')));
      console.log(srcs);
    }

    return {
      page,
      images: srcs,
      json: jsonObject,
    };
  }

  private async waitOneOf(page: Page) {
    await sleep(1000);

    const articles = await page.$$('article[data-testid^="conversation-turn"]');
    if (articles.length === 0) {
      throw new Error('❌ Không tìm thấy article nào.');
    }
    const lastArticle = articles[articles.length - 1];

    const selectors = [
      '[data-testid="copy-turn-action-button"]',
      '[data-testid="good-response-turn-action-button"]',
      '[data-testid="bad-response-turn-action-button"]',
    ];

    return await Promise.race(
      selectors.map((selector) =>
        lastArticle.waitForSelector(selector, {
          timeout: 1000 * 60 * 5,
        }),
      ),
    );
  }

  private async setUpBlogGenerate(
    context: BrowserContext,
    images: (string | null)[],
    json: JsonChatGPT,
  ) {
    const page = await context.newPage();
    await page.goto(
      'https://admin.shopify.com/store/the-rike-inc/apps/jolt/posts',
      {
        waitUntil: 'networkidle',
        timeout: 1000 * 60 * 1,
      },
    );

    const iframe = page.frameLocator('iframe[name="app-iframe"]');

    const buttonAdvancedMode = iframe
      .locator(
        'button[class="Polaris-Button Polaris-Button--pressable Polaris-Button--variantSecondary Polaris-Button--sizeMedium Polaris-Button--textAlignCenter"]',
      )
      .nth(0);
    await buttonAdvancedMode.click();

    await iframe
      .locator('ul.Polaris-Box--listReset button')
      .getByText('Informative')
      .click();

    await iframe
      .locator('select.Polaris-Select__Input')
      .nth(1)
      .selectOption('long');

    const inputs = iframe.locator(
      '.Polaris-Connected__Item.Polaris-Connected__Item--primary input',
    );

    // Điền vào input đầu tiên
    await inputs.nth(0).fill(
      // `Keywords: ${json.keywords.join(', ')}\nWhy These Keywords Work: ${json.whyTheseKeywordsWork}\nSuggested Blog Sections: ${json.suggestedBlogSections.join(', ')}`,
      Object.keys(json)
        .filter((key) => key !== 'title')
        .map((key) => {
          const value = json[key] as string | string[];
          if (Array.isArray(value)) {
            return `${key}: ${value.join(', ')}`;
          } else {
            return `${key}: ${value}`;
          }
        })
        .join('\n'),
    );

    const count = await inputs.count();
    await inputs.nth(count - 1).fill(json.title);

    await iframe
      .locator(
        'button[class="Polaris-Button Polaris-Button--pressable Polaris-Button--variantPrimary Polaris-Button--sizeMedium Polaris-Button--textAlignCenter"]',
      )
      .click();

    await iframe
      .locator('.Polaris-Spinner--sizeLarge')
      .waitFor({ state: 'visible', timeout: 10000 });
    await iframe
      .locator('.Polaris-Spinner--sizeLarge')
      .waitFor({ state: 'hidden', timeout: 190000 }); // tối đa 3 phút

    console.log('Done generate');

    // Polaris-ResourceList__ResourceListWrapper
    const aLink = iframe
      .locator('div[class="Polaris-ResourceList__ResourceListWrapper"] ul a')
      .first();

    const href = await aLink.getAttribute('href');
    console.log(href);

    await page.goto(href as string, {
      waitUntil: 'networkidle',
      timeout: 1000 * 60 * 1,
    });
    await this.publicBlog(page, images);

    return {
      page,
      url_blog: href,
    };
  }

  private async publicBlog(page: Page, images: (string | null)[]) {
    if (images.length > 0) {
      const buttonAddMainImage = page.locator(
        'div[class="Polaris-DropZone__Container"]',
      );
      await buttonAddMainImage.click();

      const inputFileMainImage = page
        .locator(
          'div[class="Polaris-Modal-Dialog__Container"] .Polaris-Labelled--hidden input[type="file"]',
        )
        .nth(0);
      if (images[0]) {
        const buffer = await this.fetchBinaryFile(images[0]);

        await inputFileMainImage.setInputFiles({
          name: 'main-image.jpg',
          mimeType: 'image/jpeg',
          buffer,
        });

        const buttonDone = page.locator(
          'div[class="Polaris-Modal-Dialog__Container"] button[class="Polaris-Button Polaris-Button--pressable Polaris-Button--variantPrimary Polaris-Button--sizeMedium Polaris-Button--textAlignCenter"]',
        );
        await buttonDone.click();

        await sleep(1000);
      }

      // editor
      const editorFrame = page.frameLocator('iframe.tox-edit-area__iframe');

      const h2s = await editorFrame.locator('body h2').elementHandles();

      for (let i = 0; i < images.length; i++) {
        const h2 = h2s[i + 1];

        if (!h2) {
          console.log('💥 Không tìm thấy h2');
          continue;
        }

        await h2.scrollIntoViewIfNeeded();
        const box = await h2.boundingBox();
        if (!box) {
          console.log('💥 Không tìm thấy box', h2);
          continue;
        }

        await page.mouse.click(box.x + 5, box.y + 5);
        await page.waitForTimeout(100);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(100);
        await page.keyboard.press('ArrowUp');

        await page.waitForTimeout(1000);

        await page.locator('button[aria-label="Insert image"]').nth(0).click();

        await page.waitForTimeout(1000);

        if (i === 0) {
          const li = page
            .locator('div[class="Polaris-Modal-Dialog__Container"] ul li')
            .first();

          await li.locator('div > div').first().click();
        } else {
          const inputFile = page
            .locator(
              'div[class="Polaris-Modal-Dialog__Container"] .Polaris-Labelled--hidden input[type="file"]',
            )
            .nth(0);
          try {
            const buffer = await this.fetchBinaryFile(images[i] as string);
            await inputFile.setInputFiles({
              name: 'image.jpg',
              mimeType: 'image/jpeg',
              buffer,
            });
          } catch (error) {
            console.log('💥 Lỗi file ảnh:', error);
            const cancelButton = page.locator(
              'div[class="Polaris-Modal-Dialog__Container"] button[class="Polaris-Button Polaris-Button--pressable Polaris-Button--variantSecondary Polaris-Button--sizeMedium Polaris-Button--textAlignCenter"]:has-text("Cancel")',
            );
            await cancelButton.click();
            continue;
          }
        }

        const buttonDone = page.locator(
          'div[class="Polaris-Modal-Dialog__Container"] button[class="Polaris-Button Polaris-Button--pressable Polaris-Button--variantPrimary Polaris-Button--sizeMedium Polaris-Button--textAlignCenter"]:not([aria-disabled="true"])',
        );

        await buttonDone.waitFor({
          timeout: 1000 * 60 * 1, // 1 phút
        });

        await buttonDone.click();

        await page.waitForTimeout(2000);
      }

      await page.locator('label.Polaris-Choice:has-text("Visible")').click();

      await page.waitForTimeout(1000);

      await page
        .locator(
          'button[class="Polaris-Button Polaris-Button--pressable Polaris-Button--variantPlain Polaris-Button--sizeMedium Polaris-Button--textAlignCenter Polaris-Button--iconOnly"][aria-label="Set visibility date"]',
        )
        .click();

      // set time hh:mm am/pm
      const time = new Date();
      const hours = time.getHours();
      const minutes = time.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const hours12 = hours % 12 || 12;
      const timeString = `${hours12}:${(minutes + 1).toString().padStart(2, '0')} ${ampm}`;

      await page
        .locator(
          'input[class="Polaris-TextField__Input Polaris-TextField__Input--suffixed"]',
        )
        .fill(timeString);

      await page.locator('div.Polaris-Modal-Section').click();

      await page.waitForTimeout(1000);

      await page
        .locator(
          'div.Polaris-Modal-Footer button[class="Polaris-Button Polaris-Button--pressable Polaris-Button--variantPrimary Polaris-Button--sizeMedium Polaris-Button--textAlignCenter"]',
        )
        .click();

      await page.waitForTimeout(1000);

      const saveButton = page.locator(
        'button.Polaris-Button--variantPrimary.Polaris-Button--sizeMedium.Polaris-Button--textAlignCenter',
      );

      await saveButton.click();

      await page
        .locator(
          'button.Polaris-Button--variantPrimary.Polaris-Button--sizeMedium.Polaris-Button--textAlignCenter.Polaris-Button--loading',
        )
        .waitFor({ timeout: 1000 * 60 * 0.5 });

      // await page
      //   .locator(
      //     'button.Polaris-Button--variantPrimary.Polaris-Button--sizeMedium.Polaris-Button--textAlignCenter:not(.Polaris-Button--loading)',
      //   )
      //   .waitFor({ timeout: 1000 * 60 * 0.5 });

      await page.waitForFunction(
        (selector: string) => !document.querySelector(selector),
        'button.Polaris-Button--variantPrimary.Polaris-Button--sizeMedium.Polaris-Button--textAlignCenter.Polaris-Button--loading',
        { timeout: 1000 * 60 * 0.5 },
      );

      const errorBanner = page.locator('.Polaris-Banner--withinPage');

      if (await errorBanner.isVisible()) {
        const errorText = await errorBanner.innerText();
        throw new PublishBlogError('Publish failed: ' + errorText);
      }

      console.log('✅ Publish thành công');
    }
  }

  private async fetchBinaryFile(url: string): Promise<Buffer> {
    const response$ = this.httpService.get(url, {
      responseType: 'arraybuffer',
    });

    const response = await lastValueFrom(response$);
    return Buffer.from(response.data);
  }
}

class PublishBlogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublishBlogError';
  }
}

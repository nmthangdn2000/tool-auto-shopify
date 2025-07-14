import * as os from 'os';
import * as path from 'path';
import { chromium } from 'playwright-core';

export const launchBrowser = async (showBrowser: boolean) => {
  const platform = os.platform();

  let userDataDir: string | undefined;
  let executablePath: string | undefined;

  if (platform === 'darwin') {
    userDataDir = path.join(
      os.homedir(),
      'Library/Application Support/Google/Chrome/Default',
    );
    executablePath =
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }

  if (platform === 'win32') {
    userDataDir = path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData/Local'),
      'Google/Chrome/User Data/Default',
    );
    executablePath =
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  }

  if (!userDataDir || !executablePath) {
    throw new Error('Unsupported platform: ' + platform);
  }

  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: showBrowser ? false : true,
    executablePath,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      // '--profile-directory=Profile 5',
    ],
    viewport: {
      width: process.env.BROWSER_WIDTH
        ? parseInt(process.env.BROWSER_WIDTH)
        : 1400,
      height: process.env.BROWSER_HEIGHT
        ? parseInt(process.env.BROWSER_HEIGHT)
        : 800,
    },
    locale: process.env.LOCALE || 'en-US',
    timezoneId: process.env.TIMEZONE || 'Asia/Ho_Chi_Minh',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  return browser;
};

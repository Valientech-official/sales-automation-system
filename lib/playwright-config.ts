/**
 * Vercel対応Playwright設定
 * サーバーレス環境でのPlaywright設定
 */

import { chromium } from 'playwright';

// Vercel環境でのChromium設定
export const getPlaywrightBrowser = async () => {
  // Vercel環境の場合
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    // Dynamic imports to avoid ESLint issues
    const chromiumPuppeteer = await import('@sparticuz/chromium');
    const { chromium: playwright } = await import('playwright');
    
    return await playwright.launch({
      args: chromiumPuppeteer.default.args,
      executablePath: await chromiumPuppeteer.default.executablePath(),
      headless: chromiumPuppeteer.default.headless,
    });
  } 
  
  // ローカル環境の場合
  return await chromium.launch({
    headless: true,
  });
};

export default getPlaywrightBrowser;
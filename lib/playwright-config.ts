/**
 * Vercel対応Playwright設定
 * サーバーレス環境でのPlaywright設定
 */

import { chromium } from 'playwright';

// Vercel環境でのChromium設定
export const getPlaywrightBrowser = async () => {
  // Vercel環境の場合
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    const chromium = require('@sparticuz/chromium');
    const { chromium: playwright } = require('playwright');
    
    return await playwright.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  } 
  
  // ローカル環境の場合
  return await chromium.launch({
    headless: true,
  });
};

export default getPlaywrightBrowser;
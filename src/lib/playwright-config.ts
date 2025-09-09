/**
 * Playwright Configuration for Vercel and Local Development
 * Centralized browser initialization with Vercel compatibility
 */

import { chromium } from 'playwright'

/**
 * Get Playwright browser instance with Vercel/production support
 * Automatically detects environment and uses appropriate configuration
 */
export const getPlaywrightBrowser = async () => {
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    // Vercel production environment - use @sparticuz/chromium
    const chromiumPuppeteer = await import('@sparticuz/chromium')
    
    return await chromium.launch({
      args: chromiumPuppeteer.default.args,
      executablePath: await chromiumPuppeteer.default.executablePath(),
      headless: true, // Always headless in production
    })
  } else {
    // Local development environment - use regular chromium
    return await chromium.launch({
      headless: true,
      slowMo: 100 // Add slight delay for debugging
    })
  }
}

/**
 * Browser configuration options
 */
export const BROWSER_CONFIG = {
  // Timeout settings
  pageTimeout: 30000,      // 30 seconds
  navigationTimeout: 15000, // 15 seconds
  
  // Performance settings
  slowMo: process.env.NODE_ENV === 'development' ? 100 : 0,
  
  // Security settings
  bypassCSP: true,
  ignoreHTTPSErrors: true
}
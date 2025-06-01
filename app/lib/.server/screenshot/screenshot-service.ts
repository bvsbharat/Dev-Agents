/**
 * Screenshot service for capturing website screenshots
 */
import { Buffer } from 'node:buffer';

/**
 * Environment variable interface extension
 */
declare global {
  interface Env {
    SCREENSHOT_API_KEY: string;
  }
}

/**
 * Screenshot options
 */
export interface ScreenshotOptions {
  url: string;
  format?: 'png' | 'jpg' | 'jpeg' | 'webp';
  blockAds?: boolean;
  blockCookieBanners?: boolean;
  blockTrackers?: boolean;
  imageQuality?: number;
  fullPage?: boolean;
  delay?: number;
  timeout?: number;
}

/**
 * Captures a screenshot of a website
 * @param options Screenshot options
 * @param env Environment variables
 * @returns Screenshot as a buffer
 */
export async function captureScreenshot(
  options: ScreenshotOptions,
  env: Env
): Promise<Buffer> {
  /* Build the screenshot URL with parameters */
  const apiUrl = new URL('https://api.screenshotone.com/take');
  
  /* Add access key */
  apiUrl.searchParams.append('access_key', env.SCREENSHOT_API_KEY);
  
  /* Add required URL parameter */
  apiUrl.searchParams.append('url', options.url);
  
  /* Add optional parameters */
  if (options.format) {
    apiUrl.searchParams.append('format', options.format);
  }
  
  if (options.blockAds !== undefined) {
    apiUrl.searchParams.append('block_ads', options.blockAds.toString());
  }
  
  if (options.blockCookieBanners !== undefined) {
    apiUrl.searchParams.append('block_cookie_banners', options.blockCookieBanners.toString());
  }
  
  if (options.blockTrackers !== undefined) {
    apiUrl.searchParams.append('block_trackers', options.blockTrackers.toString());
  }
  
  if (options.imageQuality !== undefined) {
    apiUrl.searchParams.append('image_quality', options.imageQuality.toString());
  }
  
  if (options.fullPage !== undefined) {
    apiUrl.searchParams.append('full_page', options.fullPage.toString());
  }
  
  if (options.delay !== undefined) {
    apiUrl.searchParams.append('delay', options.delay.toString());
  }
  
  if (options.timeout !== undefined) {
    apiUrl.searchParams.append('timeout', options.timeout.toString());
  }
  
  /* Set response type to binary */
  apiUrl.searchParams.append('response_type', 'by_format');
  
  /* Fetch the screenshot */
  const response = await fetch(apiUrl.toString());
  
  if (!response.ok) {
    throw new Error(`Screenshot API error: ${response.status} ${response.statusText}`);
  }
  
  /* Return the screenshot as a buffer */
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Converts a buffer to a data URL
 * @param buffer Buffer to convert
 * @param mimeType MIME type of the buffer content
 * @returns Data URL string
 */
export function bufferToDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

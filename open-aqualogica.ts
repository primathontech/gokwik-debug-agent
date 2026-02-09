import { chromium } from 'playwright';

async function openAqualogica() {
  console.log('Launching browser in headed mode...');

  const browser = await chromium.launch({
    headless: false, // headed mode
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  console.log('Navigating to Aqualogica website...');
  await page.goto('https://aqualogica.in', {
    waitUntil: 'domcontentloaded',
  });

  console.log('Website loaded. Browser will stay open. Press Ctrl+C to close.');

  // Keep the browser open until user terminates
  await new Promise(() => {});
}

openAqualogica().catch(console.error);

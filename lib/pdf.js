// Renders an HTML string to a PDF Buffer. Uses full Puppeteer (bundled Chromium) locally,
// and @sparticuz/chromium's binary on Vercel's serverless runtime where a system Chromium isn't available.
//
// `anchorText`, if given, is inserted as a hidden span right after the DOM text node matching
// `anchorAfterPattern`. The Flowork templates render their body from a JSON blob unpacked by
// client-side JS, so the anchor must be injected into the *rendered* DOM (post-JS), not the raw
// HTML string — a regex against the raw source would hit the JSON-escaped copy instead.
export async function renderHtmlToPdf(html, { anchorText, anchorAfterPattern } = {}) {
  const isServerless = !!process.env.VERCEL;

  let browser;
  if (isServerless) {
    const chromium = (await import('@sparticuz/chromium')).default;
    const puppeteer = await import('puppeteer-core');
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  } else {
    const puppeteer = await import('puppeteer');
    browser = await puppeteer.launch({ headless: true });
  }

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    if (anchorText && anchorAfterPattern) {
      const inserted = await page.evaluate(
        (text, patternSource) => {
          const pattern = new RegExp(patternSource);
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode())) {
            if (pattern.test(node.textContent)) {
              const span = document.createElement('span');
              span.textContent = text;
              span.style.fontSize = '1px';
              span.style.color = '#ffffff';
              node.parentNode.insertBefore(span, node.nextSibling);
              return true;
            }
          }
          return false;
        },
        anchorText,
        anchorAfterPattern.source
      );
      if (!inserted) {
        throw new Error('Could not locate a signature label to anchor the sign-here tab to');
      }
    }

    const pdfBytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    });
    // page.pdf() returns a Uint8Array, not a Node Buffer — wrap it so .toString('base64')
    // (used by callers) actually base64-encodes instead of joining bytes with commas.
    return Buffer.from(pdfBytes);
  } finally {
    await browser.close();
  }
}

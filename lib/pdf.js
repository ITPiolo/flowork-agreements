// Renders an HTML string to a PDF Buffer. Uses full Puppeteer (bundled Chromium) locally,
// and @sparticuz/chromium's binary on Vercel's serverless runtime where a system Chromium isn't available.
//
// `anchors`, if given, is a list of { id, pattern, occurrence, tab: { type } } — for each, the
// browser MEASURES real pixel geometry to work out where the fillable box should sit (the blank
// line/row below a text label, or the checkbox glyph next to a Yes/No option), then a hidden
// anchor span carrying that field's id is inserted right before the matched label text so
// DocuSign can find it in the final PDF's text layer.
//
// Measurement uses Range.getBoundingClientRect() rather than inserting a probe element, because
// inserting elements mutates the DOM — even a 1px-font phantom span nudges surrounding line
// layout slightly, and with ~60 fields those nudges compound across the page. Since each field
// was measured against a DOM state with a different number of prior insertions, positions
// captured that way stop matching the page's *final* layout by the time all insertions are
// done, even though each measurement was individually correct at the moment it was taken. All
// measuring happens first, with zero mutation; anchor spans are inserted only afterward, in a
// separate pass, once no more measurements will be taken.
//
// Returns { pdfBuffer, placements } where placements is [{ id, xOffset, yOffset, width, height }]
// for the caller to build DocuSign tabs from.
export async function renderHtmlToPdf(html, { anchors = [] } = {}) {
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
    // Puppeteer's page.pdf() renders under the 'print' CSS media type by default, which can
    // differ from the 'screen' rendering used for on-page measurement (different default
    // margins/font metrics/etc.), so anchor positions measured on screen wouldn't necessarily
    // match the actual printed PDF. Force 'screen' so what gets measured is what gets printed.
    await page.emulateMediaType('screen');
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });

    let placements = [];
    if (anchors.length > 0) {
      const anchorSpecs = anchors.map((a) => ({ id: a.id, pattern: a.pattern, occurrence: a.occurrence, type: a.tab.type }));
      const { placements: measured, missing } = await page.evaluate((specs) => {
        function rectOf(el) {
          const r = el.getBoundingClientRect();
          return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
        }

        // Position of the very start of a text node, measured without inserting anything.
        function startRectOf(textNode) {
          const range = document.createRange();
          range.setStart(textNode, 0);
          range.setEnd(textNode, Math.min(1, textNode.length));
          const r = range.getBoundingClientRect();
          return { top: r.top, left: r.left, bottom: r.bottom, right: r.left, width: 0, height: r.height || 12 };
        }

        // A "blank line/row" candidate: no visible text, and either a thin divider
        // (height <= 4px) or a bordered blank row (has a bottom border, height under 50px).
        function looksBlank(el) {
          if (!(el instanceof Element)) return false;
          if (el.textContent.trim().length > 0) return false;
          const style = getComputedStyle(el);
          const h = el.getBoundingClientRect().height;
          const hasBottomBorder = parseFloat(style.borderBottomWidth) > 0;
          const hasBackground = style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
          return h > 0 && h <= 50 && (hasBottomBorder || (hasBackground && h <= 4));
        }

        // Finds the nearest blank-line/row element positioned below `fromRect`, searching
        // outward through increasing ancestor levels (siblings-of-parent, then
        // siblings-of-grandparent, etc.) since label rows are structured differently across
        // this template (some have the underline as a direct sibling, others as a sibling of
        // a whole grid row several levels up).
        function findBlankBelow(labelEl, fromRect) {
          let scope = labelEl;
          for (let level = 0; level < 4 && scope; level++) {
            const container = scope.parentElement;
            if (!container) break;
            const candidates = Array.from(container.children).filter(looksBlank);
            let best = null;
            let bestGap = Infinity;
            for (const c of candidates) {
              const r = c.getBoundingClientRect();
              const gap = r.top - fromRect.bottom;
              if (gap >= -2 && gap < bestGap) {
                best = c;
                bestGap = gap;
              }
            }
            if (best) return best;
            scope = container;
          }
          return null;
        }

        function isCheckboxGlyph(el) {
          const r = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          const isSquareish = r.width > 0 && r.width < 24 && Math.abs(r.width - r.height) < 4;
          const hasBorder = parseFloat(style.borderWidth || style.borderTopWidth) > 0;
          return isSquareish && hasBorder;
        }

        // Finds a small square checkbox-glyph element next to the label text. The glyph is a
        // sibling of the text NODE itself in this template (both the "glyph precedes label" and
        // "label precedes glyph" patterns put them as siblings within the same small container),
        // not a sibling of the label's own containing element — checking the wrong one silently
        // finds nothing. A direct sibling of the text node is trusted unconditionally; the
        // labelEl-sibling check is a secondary fallback (with a distance guard, since a match
        // there isn't structurally guaranteed and this template has other small square glyphs
        // elsewhere, like bullet-point-style list markers, that could otherwise false-match).
        function findCheckboxGlyph(targetNode, labelEl, anchorRect) {
          const direct = [targetNode.previousSibling, targetNode.nextSibling].find(
            (n) => n instanceof Element && isCheckboxGlyph(n)
          );
          if (direct) return direct;

          const fallback = [labelEl.previousElementSibling, labelEl.nextElementSibling].filter(Boolean);
          for (const c of fallback) {
            if (!isCheckboxGlyph(c)) continue;
            const r = c.getBoundingClientRect();
            const isNearby = Math.abs(r.top - anchorRect.top) < 40 && Math.abs(r.left - anchorRect.left) < 100;
            if (isNearby) return c;
          }
          return null;
        }

        const results = [];
        const missing = [];
        const toInsert = []; // { targetNode } — anchor spans inserted only after all measuring is done

        for (const { id, pattern: patternSource, occurrence, type } of specs) {
          const pattern = new RegExp(patternSource, 'i');
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let node;
          let seen = 0;
          let target = null;
          while ((node = walker.nextNode())) {
            if (pattern.test(node.textContent.trim())) {
              if (seen === occurrence) {
                target = node;
                break;
              }
              seen += 1;
            }
          }
          if (!target) {
            missing.push(id);
            continue;
          }

          const labelEl = target.parentElement;
          const labelRect = rectOf(labelEl);
          const anchorRect = startRectOf(target);
          toInsert.push({ id, target });

          if (type === 'sign') {
            results.push({ id, xOffset: 0, yOffset: 0, width: null, height: null });
            continue;
          }

          if (type === 'checkbox' || type === 'radio') {
            const glyph = findCheckboxGlyph(target, labelEl, anchorRect);
            if (glyph) {
              const g = rectOf(glyph);
              results.push({
                id,
                xOffset: Math.round(g.left - anchorRect.left),
                yOffset: Math.round(g.top - anchorRect.top),
                width: Math.round(g.width),
                height: Math.round(g.height),
              });
            } else {
              // Fall back to a small nudge right of the label if no glyph is found nearby.
              results.push({ id, xOffset: 20, yOffset: 0, width: 10, height: 10 });
            }
            continue;
          }

          // type === 'text'
          const blankEl = findBlankBelow(labelEl, labelRect);
          if (blankEl) {
            const b = rectOf(blankEl);
            // Some rows (e.g. multi-column headers above a set of full-width blank rows meant
            // for free-form table entries) have a blank target much wider than the label's own
            // column. In that case, clamp to the label's column width instead of the full
            // target width, so each field's box doesn't overlap its neighbors.
            const useLabelColumn = b.width > labelRect.width * 1.4;
            results.push({
              id,
              xOffset: Math.round((useLabelColumn ? labelRect.left : b.left) - anchorRect.left),
              yOffset: Math.round(b.top - anchorRect.bottom) + 2,
              width: Math.round(Math.max(useLabelColumn ? labelRect.width : b.width, 40)),
              height: 16,
            });
          } else {
            // Fall back to a reasonable guess if no blank-line element was found nearby.
            results.push({ id, xOffset: 0, yOffset: 16, width: 150, height: 16 });
          }
        }

        // All measuring is done — now mutate the DOM. Insertions from here on can shift layout
        // without corrupting any measurement, since none remain to be taken.
        for (const { id, target } of toInsert) {
          const anchorSpan = document.createElement('span');
          anchorSpan.textContent = id;
          anchorSpan.style.fontSize = '1px';
          anchorSpan.style.color = '#ffffff';
          target.parentNode.insertBefore(anchorSpan, target);
        }

        return { placements: results, missing };
      }, anchorSpecs);

      if (missing.length > 0) {
        throw new Error(`Could not locate anchor points for: ${missing.join(', ')}`);
      }
      placements = measured;
    }

    const pdfBytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    });
    // page.pdf() returns a Uint8Array, not a Node Buffer — wrap it so .toString('base64')
    // (used by callers) actually base64-encodes instead of joining bytes with commas.
    return { pdfBuffer: Buffer.from(pdfBytes), placements };
  } finally {
    await browser.close();
  }
}

// Renders `html` with `values` written directly and visibly onto the page — text answers on
// their blank line, checkmarks in checkbox/radio glyphs — using the same label/blank-line
// detection as renderHtmlToPdf, but skipping DocuSign entirely for data entry: the values become
// literal PDF content in this one render pass, so there's no cross-system coordinate translation
// to get wrong. A single hidden anchor is still inserted for `signatureField` (if given) so
// DocuSign can place the actual signature tab — the one thing DocuSign has been reliable at.
// `values` is a map of field id -> string (text fields) | boolean (checkbox/radio fields).
export async function renderFilledPdf(html, fields, values, { signatureField } = {}) {
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
    await page.emulateMediaType('screen');
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });

    const fieldSpecs = fields.map((f) => ({
      id: f.id,
      pattern: f.pattern,
      occurrence: f.occurrence,
      type: f.tab.type,
      value: values[f.id],
      label: f.tab.tabLabel,
    }));
    const sigSpec = signatureField
      ? { id: signatureField.id, pattern: signatureField.pattern, occurrence: signatureField.occurrence }
      : null;

    const missing = await page.evaluate((specs, sig) => {
      function looksBlank(el) {
        if (!(el instanceof Element)) return false;
        if (el.textContent.trim().length > 0) return false;
        const style = getComputedStyle(el);
        const h = el.getBoundingClientRect().height;
        const hasBottomBorder = parseFloat(style.borderBottomWidth) > 0;
        const hasBackground = style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
        return h > 0 && h <= 50 && (hasBottomBorder || (hasBackground && h <= 4));
      }

      function findBlankBelow(labelEl, fromRect) {
        let scope = labelEl;
        for (let level = 0; level < 4 && scope; level++) {
          const container = scope.parentElement;
          if (!container) break;
          const candidates = Array.from(container.children).filter(looksBlank);
          let best = null;
          let bestGap = Infinity;
          for (const c of candidates) {
            const r = c.getBoundingClientRect();
            const gap = r.top - fromRect.bottom;
            if (gap >= -2 && gap < bestGap) {
              best = c;
              bestGap = gap;
            }
          }
          if (best) return best;
          scope = container;
        }
        return null;
      }

      function isCheckboxGlyph(el) {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const isSquareish = r.width > 0 && r.width < 24 && Math.abs(r.width - r.height) < 4;
        const hasBorder = parseFloat(style.borderWidth || style.borderTopWidth) > 0;
        return isSquareish && hasBorder;
      }

      // The glyph is a sibling of the text NODE itself (both the "glyph precedes label" and
      // "label precedes glyph" patterns in this template put them as siblings within the same
      // small container) — not a sibling of the label's own containing element.
      function findCheckboxGlyph(targetNode, labelEl) {
        const direct = [targetNode.previousSibling, targetNode.nextSibling].find(
          (n) => n instanceof Element && isCheckboxGlyph(n)
        );
        if (direct) return direct;
        const fallback = [labelEl.previousElementSibling, labelEl.nextElementSibling].filter(Boolean);
        return fallback.find(isCheckboxGlyph) || null;
      }

      // Skips text nodes inside content this function has already written — a submitted value
      // can coincidentally match another field's own label pattern (e.g. someone types
      // "Passport" as their ID type, which then collides with the "Passport" checklist item's
      // search), and being earlier in the DOM it would otherwise hijack that field's match.
      function findTarget(pattern, occurrence) {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        let seen = 0;
        while ((node = walker.nextNode())) {
          if (node.parentElement?.closest('.__kyc_filled_value')) continue;
          if (pattern.test(node.textContent.trim())) {
            if (seen === occurrence) return node;
            seen += 1;
          }
        }
        return null;
      }

      const missing = [];

      for (const { id, pattern: patternSource, occurrence, type, value, label } of specs) {
        const pattern = new RegExp(patternSource, 'i');
        const target = findTarget(pattern, occurrence);
        if (!target) {
          missing.push(id);
          continue;
        }
        const labelEl = target.parentElement;

        if (type === 'text') {
          if (!value) continue;
          const labelRect = labelEl.getBoundingClientRect();
          const blankEl = findBlankBelow(labelEl, labelRect);
          if (!blankEl) {
            missing.push(id + ' (no blank line)');
            continue;
          }
          // Some rows (e.g. a multi-column header above full-width blank rows meant for
          // free-form table entries, like the owners/partners table) have a blank target much
          // wider than the label's own column — each column's field ends up claiming a
          // different one of the stacked blank rows rather than sitting side-by-side on one.
          // Prefix the value with its own label there so meaning isn't lost to the mismatch.
          const blankRect = blankEl.getBoundingClientRect();
          const useLabelColumn = blankRect.width > labelRect.width * 1.4;
          const displayValue = useLabelColumn ? `${label}: ${value}` : String(value);

          blankEl.textContent = '';
          const valueSpan = document.createElement('span');
          valueSpan.className = '__kyc_filled_value';
          valueSpan.textContent = displayValue;
          blankEl.appendChild(valueSpan);
          blankEl.style.height = 'auto';
          blankEl.style.background = 'transparent';
          blankEl.style.borderBottom = '1px solid #231F20';
          blankEl.style.color = '#231F20';
          blankEl.style.fontSize = '10px';
          blankEl.style.fontFamily = 'inherit';
          blankEl.style.paddingBottom = '2px';
        } else if (type === 'checkbox' || type === 'radio') {
          if (!value) continue;
          const glyph = findCheckboxGlyph(target, labelEl);
          if (!glyph) {
            missing.push(id + ' (no glyph)');
            continue;
          }
          glyph.textContent = '✕';
          glyph.style.display = 'inline-flex';
          glyph.style.alignItems = 'center';
          glyph.style.justifyContent = 'center';
          glyph.style.fontSize = '9px';
          glyph.style.lineHeight = '1';
          glyph.style.color = '#231F20';
          glyph.style.fontWeight = 'bold';
        }
      }

      if (sig) {
        const pattern = new RegExp(sig.pattern, 'i');
        const target = findTarget(pattern, sig.occurrence);
        if (target) {
          const anchorSpan = document.createElement('span');
          anchorSpan.textContent = sig.id;
          anchorSpan.style.fontSize = '1px';
          anchorSpan.style.color = '#ffffff';
          target.parentNode.insertBefore(anchorSpan, target);
        } else {
          missing.push(sig.id + ' (signature anchor)');
        }
      }

      return missing;
    }, fieldSpecs, sigSpec);

    if (missing.length > 0) {
      // Non-fatal: log and continue — a missing optional field shouldn't block sending the
      // document, but is worth knowing about if the template ever changes.
      console.error('renderFilledPdf: could not place', missing.join(', '));
    }

    const pdfBytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    });
    return { pdfBuffer: Buffer.from(pdfBytes) };
  } finally {
    await browser.close();
  }
}

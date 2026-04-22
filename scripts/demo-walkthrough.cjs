'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.DEMO_URL || 'http://localhost:8082';
const VIDEO_DIR = path.join(__dirname, '..', 'screenshots');
const OUTPUT_NAME = 'tackbird-demo-walkthrough.webm';
const REHEARSAL = process.argv.includes('--rehearse');

// ── Helpers ──

async function injectCursor(page) {
  await page.evaluate(() => {
    if (document.getElementById('demo-cursor')) return;
    const cursor = document.createElement('div');
    cursor.id = 'demo-cursor';
    cursor.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 3L19 12L12 13L9 20L5 3Z" fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`;
    cursor.style.cssText = `
      position: fixed; z-index: 999999; pointer-events: none;
      width: 24px; height: 24px;
      transition: left 0.1s, top 0.1s;
      filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.3));
    `;
    cursor.style.left = '0px';
    cursor.style.top = '0px';
    document.body.appendChild(cursor);
    document.addEventListener('mousemove', (e) => {
      cursor.style.left = e.clientX + 'px';
      cursor.style.top = e.clientY + 'px';
    });
  });
}

async function injectSubtitleBar(page) {
  await page.evaluate(() => {
    if (document.getElementById('demo-subtitle')) return;
    const bar = document.createElement('div');
    bar.id = 'demo-subtitle';
    bar.style.cssText = `
      position: fixed; bottom: 60px; left: 0; right: 0; z-index: 999998;
      text-align: center; padding: 10px 20px;
      background: rgba(0, 0, 0, 0.8);
      color: white; font-family: -apple-system, "Segoe UI", sans-serif;
      font-size: 14px; font-weight: 500; letter-spacing: 0.3px;
      transition: opacity 0.4s;
      pointer-events: none;
      border-radius: 12px;
      margin: 0 16px;
    `;
    bar.textContent = '';
    bar.style.opacity = '0';
    document.body.appendChild(bar);
  });
}

async function showSubtitle(page, text) {
  await page.evaluate((t) => {
    const bar = document.getElementById('demo-subtitle');
    if (!bar) return;
    if (t) {
      bar.textContent = t;
      bar.style.opacity = '1';
    } else {
      bar.style.opacity = '0';
    }
  }, text);
  if (text) await page.waitForTimeout(600);
}

async function injectOverlays(page) {
  await injectCursor(page);
  await injectSubtitleBar(page);
}

async function moveAndClick(page, locator, label, opts = {}) {
  const { postClickDelay = 800 } = opts;
  const el = typeof locator === 'string' ? page.locator(locator).first() : locator;
  const visible = await el.isVisible().catch(() => false);
  if (!visible) {
    console.error(`WARNING: moveAndClick skipped - "${label}" not visible`);
    return false;
  }
  try {
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const box = await el.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
      await page.waitForTimeout(400);
    }
    await el.click();
  } catch (e) {
    console.error(`WARNING: moveAndClick failed on "${label}": ${e.message}`);
    return false;
  }
  await page.waitForTimeout(postClickDelay);
  return true;
}

async function panElements(page, selector, maxCount = 5) {
  const elements = await page.locator(selector).all();
  for (let i = 0; i < Math.min(elements.length, maxCount); i++) {
    try {
      const box = await elements[i].boundingBox();
      if (box && box.y > 0 && box.y < 750) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
        await page.waitForTimeout(500);
      }
    } catch (e) {
      console.warn(`WARNING: panElements skipped ${i}: ${e.message}`);
    }
  }
}

async function ensureVisible(page, locator, label) {
  const el = typeof locator === 'string' ? page.locator(locator).first() : locator;
  const visible = await el.isVisible().catch(() => false);
  if (!visible) {
    console.error(`REHEARSAL FAIL: "${label}" not found`);
    return false;
  }
  console.log(`REHEARSAL OK: "${label}"`);
  return true;
}

async function smoothScroll(page, amount, duration = 1000) {
  await page.evaluate(({ y, dur }) => {
    // Find the scrollable container (React Native FlatList renders in a div)
    const scrollable = document.querySelector('[data-testid="flat-list"]')
      || document.querySelector('[style*="overflow"]')
      || document.scrollingElement
      || document.documentElement;
    scrollable.scrollBy({ top: y, behavior: 'smooth' });
  }, { y: amount, dur: duration });
  await page.waitForTimeout(duration);
}

// ── Main ──

(async () => {
  const browser = await chromium.launch({ headless: true });

  if (REHEARSAL) {
    console.log('=== REHEARSAL MODE ===');
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();

    // Check feed loads
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    let allOk = true;
    const check = async (loc, label) => {
      if (!await ensureVisible(page, loc, label)) allOk = false;
    };

    // Feed elements
    await check(page.getByRole('tab', { name: 'Koti' }), 'Koti tab');
    await check(page.getByRole('tab', { name: 'Tutustu' }), 'Tutustu tab');
    await check(page.getByRole('tab', { name: 'Viestit' }), 'Viestit tab');
    await check(page.getByRole('tab', { name: 'Profiili' }), 'Profiili tab');
    await check(page.locator('text=Lähellä nyt').first(), 'Feed title');
    await check(page.locator('text=Kaikki').first(), 'Kaikki filter');
    await check(page.locator('text=Ilmaista').first(), 'Ilmaista filter');
    await check(page.locator('text=Lisää ilmoituksia').first(), 'Grid section');

    // Navigate to Explore
    await page.getByRole('tab', { name: 'Tutustu' }).click();
    await page.waitForTimeout(2000);
    await check(page.locator('text=Tutustu').first(), 'Explore title');
    await check(page.locator('text=Tapahtumat').first(), 'Tapahtumat tab');

    // Click events
    await page.locator('text=tapahtumaa tällä viikolla').first().click().catch(() => {});
    await page.waitForTimeout(1000);

    if (!allOk) {
      console.error('\nREHEARSAL FAILED — fix selectors before recording');
      process.exit(1);
    }
    console.log('\nREHEARSAL PASSED — all selectors verified');
    await browser.close();
    return;
  }

  // ── RECORDING ──
  console.log('=== RECORDING MODE ===');
  if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR, { recursive: true });

  const context = await browser.newContext({
    recordVideo: { dir: VIDEO_DIR, size: { width: 390, height: 844 } },
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark',
  });
  const page = await context.newPage();

  try {
    // ── Step 1: Feed loads ──
    console.log('Step 1: Feed');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await injectOverlays(page);
    await showSubtitle(page, 'TackBird — Naapuruston ilmoitustaulu');
    await page.waitForTimeout(3000);

    // ── Step 2: Pan header and filters ──
    console.log('Step 2: Pan feed header');
    await showSubtitle(page, 'Syöte — lähellä olevat ilmoitukset');
    // Move cursor to header
    await page.mouse.move(100, 30, { steps: 8 });
    await page.waitForTimeout(600);
    // Pan across filter pills
    const pills = page.locator('[role="tab"], [accessibilityRole="tab"]');
    const pillCount = await pills.count();
    if (pillCount > 0) {
      for (let i = 0; i < Math.min(pillCount, 4); i++) {
        try {
          const box = await pills.nth(i).boundingBox();
          if (box && box.y < 200) {
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
            await page.waitForTimeout(400);
          }
        } catch {}
      }
    }
    await page.waitForTimeout(1000);

    // ── Step 3: Click Ilmaista filter ──
    console.log('Step 3: Filter — Ilmaista');
    await showSubtitle(page, 'Suodata: Ilmaista — ilmaiset tavarat');
    const ilmaistaBtn = page.locator('text=Ilmaista').first();
    await moveAndClick(page, ilmaistaBtn, 'Ilmaista filter', { postClickDelay: 2000 });

    // Click back to Kaikki
    await showSubtitle(page, '');
    const kaikkiBtn = page.locator('text=Kaikki').first();
    await moveAndClick(page, kaikkiBtn, 'Kaikki filter', { postClickDelay: 1500 });

    // ── Step 4: Discovery stack ──
    console.log('Step 4: Discovery stack');
    await showSubtitle(page, 'Löydä — pyyhkäise kortteja');
    // Pan the discovery card
    await page.mouse.move(195, 300, { steps: 8 });
    await page.waitForTimeout(1500);
    // Move to the CTA arrow
    await page.mouse.move(340, 430, { steps: 8 });
    await page.waitForTimeout(1000);
    await showSubtitle(page, '');

    // ── Step 5: Scroll to see grid ──
    console.log('Step 5: Scroll to grid');
    await showSubtitle(page, 'Ilmoitustaulu — kaikki lähialueen ilmoitukset');
    // Try scrolling the main content
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid]') || document.scrollingElement || document.documentElement;
      // Find any scrollable div
      const scrollers = Array.from(document.querySelectorAll('div')).filter(d => {
        const s = window.getComputedStyle(d);
        return (s.overflowY === 'auto' || s.overflowY === 'scroll') && d.scrollHeight > d.clientHeight;
      });
      if (scrollers.length > 0) {
        scrollers[0].scrollBy({ top: 350, behavior: 'smooth' });
      } else {
        window.scrollBy({ top: 350, behavior: 'smooth' });
      }
    });
    await page.waitForTimeout(2000);

    // Pan the grid cards
    await page.mouse.move(100, 550, { steps: 8 });
    await page.waitForTimeout(500);
    await page.mouse.move(290, 650, { steps: 8 });
    await page.waitForTimeout(500);
    await page.mouse.move(100, 700, { steps: 8 });
    await page.waitForTimeout(1500);

    // ── Step 6: Click a post ──
    console.log('Step 6: Post detail');
    await showSubtitle(page, 'Ilmoituksen tiedot');
    // Click first visible post card button
    const postBtn = page.getByRole('button').filter({ hasText: /Tarvitsen|Tarjoan|Ilmaista|Suomenkielen|Mökkitalkkarit|Naapuruston/ }).first();
    const postVisible = await postBtn.isVisible().catch(() => false);
    if (postVisible) {
      await moveAndClick(page, postBtn, 'Post card', { postClickDelay: 2500 });
      await injectOverlays(page);
      await showSubtitle(page, 'Sijainti, tyyppi, kuvaus ja toiminnot');

      // Pan the post detail page
      await page.mouse.move(195, 280, { steps: 8 }); // Title area
      await page.waitForTimeout(800);
      await page.mouse.move(195, 350, { steps: 8 }); // Location + category
      await page.waitForTimeout(800);
      await page.mouse.move(80, 460, { steps: 8 }); // Action bar
      await page.waitForTimeout(600);
      await page.mouse.move(195, 530, { steps: 8 }); // User info
      await page.waitForTimeout(1500);

      // Go back
      await showSubtitle(page, '');
      const backBtn = page.locator('[aria-label="Takaisin"], [accessibilityLabel="Takaisin"]').first();
      const backVisible = await backBtn.isVisible().catch(() => false);
      if (backVisible) {
        await moveAndClick(page, backBtn, 'Back button', { postClickDelay: 1500 });
      } else {
        await page.goBack();
        await page.waitForTimeout(1500);
      }
      await injectOverlays(page);
    }

    // ── Step 7: Navigate to Explore ──
    console.log('Step 7: Explore tab');
    await showSubtitle(page, 'Tutustu — kartta, tapahtumat, paikat');
    const tutustuTab = page.getByRole('tab', { name: 'Tutustu' });
    await moveAndClick(page, tutustuTab, 'Tutustu tab', { postClickDelay: 2000 });
    await injectOverlays(page);

    // Pan explore page
    await page.mouse.move(195, 85, { steps: 8 }); // Sub-tabs
    await page.waitForTimeout(800);
    await page.mouse.move(195, 200, { steps: 8 }); // Avaa kartta
    await page.waitForTimeout(800);
    await page.mouse.move(195, 305, { steps: 8 }); // Events count
    await page.waitForTimeout(1500);

    // ── Step 8: Open events list ──
    console.log('Step 8: Events');
    await showSubtitle(page, 'Tapahtumat — Helsingin kaupungin tapahtumat');
    const eventsBtn = page.locator('text=tapahtumaa tällä viikolla').first();
    await moveAndClick(page, eventsBtn, 'Events count button', { postClickDelay: 2000 });
    await injectOverlays(page);

    // Pan event list items
    await page.waitForTimeout(1000);
    await page.mouse.move(195, 220, { steps: 8 }); // First event
    await page.waitForTimeout(600);
    await page.mouse.move(195, 330, { steps: 8 }); // Second event
    await page.waitForTimeout(600);
    await page.mouse.move(195, 440, { steps: 8 }); // Third event
    await page.waitForTimeout(600);
    await page.mouse.move(195, 550, { steps: 8 }); // Fourth event
    await page.waitForTimeout(1500);

    // ── Step 9: Filter events — Tänään ──
    console.log('Step 9: Today filter');
    await showSubtitle(page, 'Suodata — tänään, tällä viikolla');
    const todayBtn = page.locator('text=Tänään').first();
    const todayVisible = await todayBtn.isVisible().catch(() => false);
    if (todayVisible) {
      await moveAndClick(page, todayBtn, 'Tänään filter', { postClickDelay: 2000 });
    }

    // Switch to Tällä viikolla
    const weekBtn = page.locator('text=Tällä viikolla').first();
    const weekVisible = await weekBtn.isVisible().catch(() => false);
    if (weekVisible) {
      await moveAndClick(page, weekBtn, 'Tällä viikolla filter', { postClickDelay: 2000 });
    }
    await page.waitForTimeout(1000);

    // ── Step 10: Final — back to feed ──
    console.log('Step 10: Final');
    await showSubtitle(page, 'TackBird — naapurustosi, käden ulottuvilla');
    const kotiTab = page.getByRole('tab', { name: 'Koti' });
    await moveAndClick(page, kotiTab, 'Koti tab', { postClickDelay: 2000 });
    await injectOverlays(page);
    await page.waitForTimeout(3000);
    await showSubtitle(page, '');
    await page.waitForTimeout(1500);

  } catch (err) {
    console.error('DEMO ERROR:', err.message);
  } finally {
    await context.close();
    const video = page.video();
    if (video) {
      const src = await video.path();
      const dest = path.join(VIDEO_DIR, OUTPUT_NAME);
      try {
        fs.copyFileSync(src, dest);
        console.log('Video saved:', dest);
      } catch (e) {
        console.error('ERROR: Failed to copy video:', e.message);
        console.error('  Source:', src);
      }
    }
    await browser.close();
  }
})();

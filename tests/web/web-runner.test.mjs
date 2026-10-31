import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

function readFile(relativePath) {
  const fullPath = path.join(ROOT_DIR, relativePath);
  return fs.readFileSync(fullPath, 'utf-8');
}

describe('Web Automated Test Suite (Antigravity)', () => {
  describe('1. Landing Page (index.html)', () => {
    const htmlContent = readFile('index.html');

    test('File exists and has non-trivial size', () => {
      assert.ok(htmlContent.length > 1000, 'index.html should be populated');
    });

    test('Header & SEO Metadata are fully specified', () => {
      assert.match(htmlContent, /<title>.*Find My Cat.*<\/title>/i, 'Title should mention Find My Cat');
      assert.match(htmlContent, /<meta\s+name=["']viewport["']\s+content=["'][^"']*width=device-width[^"']*["']/i, 'Viewport must be responsive');
      assert.match(htmlContent, /<meta\s+name=["']description["']\s+content=["'][^"']+["']/i, 'Meta description should be non-empty');
      assert.match(htmlContent, /<meta\s+property=["']og:title["']/i, 'OpenGraph title must be present');
      assert.match(htmlContent, /<meta\s+property=["']og:description["']/i, 'OpenGraph description must be present');
    });

    test('Semantic HTML Structure and Landmarks', () => {
      assert.match(htmlContent, /<header/i, 'Should contain a <header> element');
      assert.match(htmlContent, /<nav/i, 'Should contain a <nav> element');
      assert.match(htmlContent, /<footer/i, 'Should contain a <footer> element');
      assert.match(htmlContent, /<h1/i, 'Must have at least one <h1> heading');
    });

    test('Waitlist / Lead Capture Form presence and attributes', () => {
      assert.match(htmlContent, /<form[^>]+id=["']beta-form["']/i, 'Waitlist form with id="beta-form" must exist');
      assert.match(htmlContent, /<input[^>]+type=["']email["']/i, 'Email input must exist for lead capture');
      assert.match(htmlContent, /<button[^>]+type=["']submit["']/i, 'Submit button must exist');
    });

    test('Supabase Waitlist Leads synchronization support', () => {
      assert.match(htmlContent, /waitlist_leads/i, 'index.html should integrate with Supabase waitlist_leads endpoint');
      assert.match(htmlContent, /FMC_SUPABASE_URL/i, 'index.html should support configurable Supabase environment URL');
    });

    test('Accessibility: All <img> tags must have alt attributes', () => {
      const imgTags = htmlContent.match(/<img[^>]+>/gi) || [];
      for (const img of imgTags) {
        assert.match(img, /alt=["'][^"']*["']/i, `Image tag missing alt attribute: ${img}`);
      }
    });

    test('Internal Anchor Links Resolution', () => {
      const anchorHrefs = [...htmlContent.matchAll(/href=["']#([a-zA-Z0-9_-]+)["']/gi)].map(m => m[1]);
      assert.ok(anchorHrefs.length > 0, 'Should have internal anchor navigation links');
      for (const anchorId of anchorHrefs) {
        const idRegex = new RegExp(`id=["']${anchorId}["']`, 'i');
        assert.ok(idRegex.test(htmlContent), `Anchor target #${anchorId} does not exist in the DOM`);
      }
    });

    test('Security & Best Practices (External Links)', () => {
      const externalLinks = [...htmlContent.matchAll(/<a\s+[^>]*href=["']https?:\/\/[^"']+["'][^>]*>/gi)];
      for (const [tag] of externalLinks) {
        if (/target=["']_blank["']/i.test(tag)) {
          assert.match(tag, /rel=["'][^"']*noopener[^"']*["']/i, `External target="_blank" must include rel="noopener": ${tag}`);
        }
      }
    });
  });

  describe('2. Sighting Reporting Runner (sighting/index.html)', () => {
    const sightingHtml = readFile('sighting/index.html');

    test('File exists and has non-trivial size', () => {
      assert.ok(sightingHtml.length > 1000, 'sighting/index.html should be populated');
    });

    test('Mobile-optimised Viewport settings', () => {
      assert.match(sightingHtml, /viewport-fit=cover/i, 'Sighting runner should have viewport-fit=cover for mobile notches');
      assert.match(sightingHtml, /user-scalable=no/i, 'Sighting runner should prevent accidental mobile pinch-zoom');
    });

    test('Zero-Signup Reporting Workflow Form elements', () => {
      assert.match(sightingHtml, /type=["']file["']/i, 'Photo upload input must exist');
      assert.match(sightingHtml, /accept=["'][^"']*image[^"']*["']/i, 'File input must accept images');
      assert.match(sightingHtml, /<button[^>]*>[\s\S]*?(?:submit|report|send|share)[\s\S]*?<\/button>/i, 'Report action button must exist');
      assert.match(sightingHtml, /id=["']btn-submit["']/i, 'Submit button with id="btn-submit" must exist');
    });

    test('URL Parameter query handling for Pet ID', () => {
      assert.ok(
        sightingHtml.includes('URLSearchParams') || sightingHtml.includes('location.search') || sightingHtml.includes('catId'),
        'Sighting script should parse URL search params to bind report to a specific cat'
      );
    });

    test('GPS & Privacy Shield UI status indicators', () => {
      assert.match(sightingHtml, /Dual-Zone Privacy Shield/i, 'Should display privacy shield notice');
      assert.match(sightingHtml, /id=["']location-status["']/i, 'Should have location status indicator');
    });

    test('PWA & App Clip Standalone Meta Configuration', () => {
      assert.match(sightingHtml, /<link[^>]+rel=["']manifest["'][^>]+href=["']manifest\.json["']/i, 'Must reference manifest.json');
      assert.match(sightingHtml, /<meta[^>]+name=["']apple-mobile-web-app-capable["'][^>]+content=["']yes["']/i, 'Must enable apple-mobile-web-app-capable');
      assert.match(sightingHtml, /<meta[^>]+name=["']apple-mobile-web-app-status-bar-style["']/i, 'Must configure status bar style');
      assert.match(sightingHtml, /<link[^>]+rel=["']apple-touch-icon["']/i, 'Must specify apple-touch-icon');
      assert.match(sightingHtml, /safe-area-inset-top/i, 'Must handle notch safe area insets');
      assert.match(sightingHtml, /serviceWorker\.register/i, 'Must register service worker for offline shell support');
    });

    test('PWA Web App Manifest (manifest.json) validity and requirements', () => {
      const manifestJson = JSON.parse(readFile('sighting/manifest.json'));
      assert.strictEqual(manifestJson.name, 'Find My Cat — Sighting Reporter');
      assert.strictEqual(manifestJson.short_name, 'Report Cat');
      assert.strictEqual(manifestJson.display, 'standalone');
      assert.strictEqual(manifestJson.theme_color, '#f05a3e');
      assert.ok(Array.isArray(manifestJson.icons) && manifestJson.icons.length >= 3, 'Must provide multiple icon sizes');
      const has192 = manifestJson.icons.some(i => i.sizes === '192x192');
      const has512 = manifestJson.icons.some(i => i.sizes === '512x512');
      const hasMaskable = manifestJson.icons.some(i => i.purpose === 'maskable');
      assert.ok(has192, 'Manifest must contain 192x192 icon');
      assert.ok(has512, 'Manifest must contain 512x512 icon');
      assert.ok(hasMaskable, 'Manifest must contain maskable icon');
    });

    test('PWA Service Worker (sw.js) static cache resilience', () => {
      const swContent = readFile('sighting/sw.js');
      assert.match(swContent, /fmc-sighting-shell/i, 'Service worker must define cache name');
      assert.match(swContent, /addEventListener\(['"]fetch['"]/i, 'Service worker must handle fetch events');
      assert.match(swContent, /caches\.open/i, 'Service worker must open cache');
      assert.match(swContent, /manifest\.json/i, 'Cache must include manifest');
    });

    test('Public Sighting Runner queries v_public_missing_cats instead of raw cats table', () => {
      assert.match(
        sightingHtml,
        /\.from\(['"]v_public_missing_cats['"]\)/,
        'Sighting runner must query masked view v_public_missing_cats to prevent home_location exposure'
      );
      assert.doesNotMatch(
        sightingHtml,
        /\.from\(['"]cats['"]\)\s*\.select\(['"]\*['"]\)/,
        'Sighting runner must never select * from raw cats table'
      );
    });
  });

  describe('3. Security Hardening (Webhooks & RLS Migrations)', () => {
    test('Stripe and RevenueCat webhooks enforce cryptographic signature / secret verification', () => {
      const stripeWebhook = readFile('supabase/functions/stripe-webhook/index.ts');
      const rcWebhook = readFile('supabase/functions/revenuecat-webhook/index.ts');

      assert.match(stripeWebhook, /STRIPE_WEBHOOK_SECRET/, 'Stripe webhook must require STRIPE_WEBHOOK_SECRET');
      assert.match(stripeWebhook, /stripe-signature/i, 'Stripe webhook must check stripe-signature header');
      assert.match(stripeWebhook, /verifyStripeSignature/, 'Stripe webhook must verify HMAC-SHA256 signature');
      assert.doesNotMatch(stripeWebhook, /\.or\(`id\.eq\.\$\{/, 'Stripe webhook must not interpolate unvalidated strings into PostgREST .or()');

      assert.match(rcWebhook, /REVENUECAT_WEBHOOK_SECRET/, 'RevenueCat webhook must require REVENUECAT_WEBHOOK_SECRET');
      assert.match(rcWebhook, /verifyRevenueCatWebhook/, 'RevenueCat webhook must verify webhook secret/signature');
    });

    test('Hardening migration locks down cats.home_location and profiles privilege escalation', () => {
      const migrationSql = readFile('supabase/migrations/20261030220000_harden_cats_profiles_and_webhooks.sql');
      assert.match(migrationSql, /REVOKE SELECT ON public\.cats FROM anon, authenticated/i);
      assert.match(migrationSql, /DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public\.profiles/i);
      assert.match(migrationSql, /fmc_trg_protect_profile_privileged_columns/i);
      assert.match(migrationSql, /REVOKE EXECUTE ON FUNCTION public\.activate_amber_alert/i);
    });
  });

  describe('4. GitHub Pages SPA Router Fallback (404.html)', () => {
    const notFoundHtml = readFile('404.html');

    test('SPA Router script redirects /sighting/:id to query parameter', () => {
      assert.ok(notFoundHtml.length > 50, '404.html should exist');
      assert.match(notFoundHtml, /window\.location\.replace/i, 'Must use window.location.replace to redirect');
      assert.match(notFoundHtml, /\/sighting\/\?id=/i, 'Must handle redirect to /sighting/?id= query parameter');
    });
  });

  describe('4. Headless Chrome Browser Verification', () => {
    test('Chrome browser binary is executable and healthy', async () => {
      const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      if (!fs.existsSync(chromePath)) {
        return; // Skip if environment doesn't have Chrome installed
      }

      const versionOutput = await new Promise((resolve) => {
        const proc = spawn(chromePath, ['--version']);
        let data = '';
        proc.stdout.on('data', (chunk) => { data += chunk; });
        proc.on('close', () => resolve(data.trim()));
      });

      assert.match(versionOutput, /Google Chrome/i, 'Chrome should report version cleanly');
    });
  });
});

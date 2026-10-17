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
  });

  describe('3. GitHub Pages SPA Router Fallback (404.html)', () => {
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

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ratingService,
  RATING_CONFIG,
} from '../src/services/ratingService.ts';

describe('App Rating & Community Review Flow', () => {
  beforeEach(async () => {
    await ratingService.resetRatingState();
  });

  test('Initial state requires milestone before automated prompting', async () => {
    const state = await ratingService.getRatingState();
    assert.strictEqual(state.hasRated, false);
    assert.strictEqual(state.neverAskAgain, false);
    assert.strictEqual(state.promptCount, 0);
    assert.strictEqual(state.significantEventsCount, 0);

    // Initial regular check should not prompt
    const shouldPrompt = await ratingService.shouldPromptForRating('sighting_reported');
    assert.strictEqual(shouldPrompt, false);
  });

  test('Manual trigger (Settings / Passport button) is always permitted', async () => {
    const shouldPrompt = await ratingService.shouldPromptForRating('manual');
    assert.strictEqual(shouldPrompt, true);
  });

  test('Significant events threshold triggers prompt after 2 actions', async () => {
    // 1st event: sighting logged
    const event1 = await ratingService.recordSignificantEvent('sighting_reported');
    assert.strictEqual(event1.shouldPrompt, false);

    // 2nd event: poster created
    const event2 = await ratingService.recordSignificantEvent('poster_generated');
    assert.strictEqual(event2.shouldPrompt, true);
  });

  test('Reunited feline event triggers immediate high-satisfaction prompt', async () => {
    const result = await ratingService.recordSignificantEvent('reunited');
    assert.strictEqual(result.shouldPrompt, true);
    assert.strictEqual(result.reason, 'reunited');
  });

  test('Store review request marks hasRated and suppresses future prompts', async () => {
    const res = await ratingService.requestStoreReview();
    assert.strictEqual(res.success, true);

    const state = await ratingService.getRatingState();
    assert.strictEqual(state.hasRated, true);

    // Automated triggers must now return false
    const shouldPromptReunited = await ratingService.shouldPromptForRating('reunited');
    assert.strictEqual(shouldPromptReunited, false);

    const shouldPromptSighting = await ratingService.shouldPromptForRating('sighting_reported');
    assert.strictEqual(shouldPromptSighting, false);

    // But manual trigger remains available
    const manualPrompt = await ratingService.shouldPromptForRating('manual');
    assert.strictEqual(manualPrompt, true);
  });

  test('User opt-out (never ask again) suppresses future automated prompts', async () => {
    await ratingService.dismissNeverAskAgain();

    const state = await ratingService.getRatingState();
    assert.strictEqual(state.neverAskAgain, true);

    const shouldPrompt = await ratingService.shouldPromptForRating('reunited');
    assert.strictEqual(shouldPrompt, false);
  });

  test('Cooldown period enforces 7-day fatigue protection', async () => {
    // Simulate prompt shown now
    await ratingService.markPromptShown();
    const state = await ratingService.getRatingState();
    assert.strictEqual(state.promptCount, 1);
    assert.ok(state.lastPromptTimestamp);

    // Immediate check should be rejected due to cooldown
    const shouldPrompt = await ratingService.shouldPromptForRating('reunited');
    assert.strictEqual(shouldPrompt, false);
  });

  test('Submitting private feedback persists entry and marks feedback submitted', async () => {
    const entry = await ratingService.submitFeedback(
      2,
      'Radar map could load quicker on mobile data',
      'Map & Radar'
    );

    assert.strictEqual(entry.rating, 2);
    assert.strictEqual(entry.comment, 'Radar map could load quicker on mobile data');
    assert.strictEqual(entry.tag, 'Map & Radar');
    assert.ok(entry.timestamp);

    const state = await ratingService.getRatingState();
    assert.strictEqual(state.feedbackSubmitted, true);
  });
});

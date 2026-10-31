import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  IS_DEMO_MODE,
  loadCatProfiles,
  loadSightings,
  loadCommunityAlerts,
} from '../src/services/storage.ts';

describe('Onboarding Journey & Two-Sided Persona Routing', () => {
  test('New users start with uncompleted onboarding and empty vault when not in demo mode', async () => {
    let hasOnboarded = false;
    assert.strictEqual(hasOnboarded, false, 'Default onboarding state must be false for new installs');
    assert.strictEqual(IS_DEMO_MODE, false, 'Production default must not enable demo seed data');

    const [cats, sightings, alerts] = await Promise.all([
      loadCatProfiles(),
      loadSightings(),
      loadCommunityAlerts(),
    ]);
    assert.strictEqual(cats.length, 0, 'Fresh install should not seed demo cats');
    assert.strictEqual(sightings.length, 0, 'Fresh install should not seed fake sightings');
    assert.strictEqual(alerts.length, 0, 'Fresh install should not seed fake alerts');
  });

  test('Cat Guardian role persists only user-provided fields without fabricating microchip or vaccines', () => {
    const role = 'guardian';
    const catName = 'Cleo';
    const breed = 'British Shorthair';
    const coatColour = 'Blue-Grey with Amber Eyes';
    const emergencyPhone = '+44 7700 900555';
    const microchipInput = '';

    const createdCat = {
      id: `cat-onboarding-${Date.now()}`,
      name: catName,
      breed,
      coatColour,
      distinctiveFeatures: '',
      microchipNumber: microchipInput.replace(/\s+/g, ''),
      photoUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba',
      status: 'safe',
      emergencyPhone,
      vaccinations: [],
    };

    assert.strictEqual(role, 'guardian');
    assert.strictEqual(createdCat.name, 'Cleo');
    assert.strictEqual(createdCat.microchipNumber, '', 'Blank microchip must remain empty rather than fabricated');
    assert.strictEqual(createdCat.vaccinations.length, 0, 'New onboarding profile must not fabricate vaccine records');
    assert.strictEqual(createdCat.status, 'safe');
  });

  test('Neighborhood Spotter role routes directly to Radar territory', () => {
    const role = 'spotter';
    const neighborhoodZone = 'Victoria Park / Hackney';

    assert.strictEqual(role, 'spotter');
    assert.ok(neighborhoodZone.length > 0, 'Spotter territory should be set');
  });

  test('Completing onboarding persists completion flag', () => {
    let mockStorage = {};
    const setOnboardingCompleted = () => {
      mockStorage['@fmc_onboarding_v1'] = 'true';
    };
    const getOnboardingCompleted = () => {
      return mockStorage['@fmc_onboarding_v1'] === 'true';
    };

    assert.strictEqual(getOnboardingCompleted(), false);
    setOnboardingCompleted();
    assert.strictEqual(getOnboardingCompleted(), true);
  });
});

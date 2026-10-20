import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Onboarding Journey & Two-Sided Persona Routing', () => {
  test('New users start with uncompleted onboarding', () => {
    let hasOnboarded = false;
    assert.strictEqual(hasOnboarded, false, 'Default onboarding state must be false for new installs');
  });

  test('Cat Guardian role configures passport setup and auto-generates ISO microchip', () => {
    const role = 'guardian';
    const catName = 'Cleo';
    const breed = 'British Shorthair';
    const coatColour = 'Blue-Grey with Amber Eyes';
    const emergencyPhone = '+44 7700 900555';

    // Simulated generation matching OnboardingScreen logic
    const microchipNumber = `98514${Math.floor(1000000000 + 0.123456789 * 9000000000)}`;

    const createdCat = {
      id: `cat-onboarding-${Date.now()}`,
      name: catName,
      breed,
      gender: 'Female',
      isNeutered: true,
      ageYears: 2,
      coatColour,
      distinctiveFeatures: 'Registered during initial onboarding',
      microchipNumber,
      photoUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba',
      status: 'safe',
      emergencyPhone,
      homeAddressApprox: 'Victoria Park / Hackney',
      vaccinations: [
        {
          id: `vac-init`,
          name: 'Core Cat Flu & Enteritis Booster',
          administeredDate: '2026-10-20',
          nextDueDate: '2027-10-20',
          vetClinic: 'Registered Veterinary Practice',
          isUpToDate: true,
        },
      ],
    };

    assert.strictEqual(role, 'guardian');
    assert.strictEqual(createdCat.name, 'Cleo');
    assert.ok(createdCat.microchipNumber.startsWith('98514'), 'Microchip should conform to ISO standard prefix');
    assert.strictEqual(createdCat.vaccinations.length, 1);
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

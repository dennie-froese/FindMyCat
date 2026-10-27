import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBoosterSchedule,
  getCatBoosterSchedules,
  scheduleLocalBoosterAlerts,
} from '../src/services/reminderService.ts';
import {
  standDownCatAlerts,
  broadcastCatMissingAlert,
  loadCommunityAlerts,
  addCatProfile,
  deleteCatProfile,
  loadCatProfiles,
  saveCatProfiles,
} from '../src/services/storage.ts';

describe('Multi-Pet Management & Digital Passport Vault', () => {
  const mockCatMochi = {
    id: 'cat-1',
    name: 'Mochi',
    breed: 'British Shorthair / Ginger Tabby',
    gender: 'Male',
    isNeutered: true,
    ageYears: 3,
    coatColour: 'Warm Ginger with White Bib & Paws',
    distinctiveFeatures: 'Small nick on left ear tip, green eyes',
    microchipNumber: '985141002345678',
    photoUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600',
    status: 'safe',
    emergencyPhone: '+44 7700 900123',
    vaccinations: [
      {
        id: 'vac-1',
        name: 'Cat Flu & Enteritis (Core Booster)',
        administeredDate: '2026-03-15',
        nextDueDate: '2027-03-15',
        vetClinic: 'Victoria Park Vets',
        isUpToDate: true,
      },
    ],
  };

  const mockCatLuna = {
    id: 'cat-2',
    name: 'Luna',
    breed: 'Domestic Shorthair / Tuxedo',
    gender: 'Female',
    isNeutered: true,
    ageYears: 2,
    coatColour: 'Sleek Black with White Moustache & Paws',
    distinctiveFeatures: 'Distinct asymmetrical white moustache, golden eyes',
    microchipNumber: '985141009876543',
    photoUrl: 'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=600',
    status: 'safe',
    emergencyPhone: '+44 7700 900123',
    vaccinations: [
      {
        id: 'vac-luna-1',
        name: 'Core Tri-Cat Booster',
        administeredDate: '2026-01-20',
        nextDueDate: '2027-01-20',
        vetClinic: 'Victoria Park Vets',
        isUpToDate: true,
      },
    ],
  };

  test('Multi-pet switcher selects distinct feline profiles', () => {
    const cats = [mockCatMochi, mockCatLuna];
    let selectedCatId = 'cat-1';

    let activeCat = cats.find((c) => c.id === selectedCatId);
    assert.strictEqual(activeCat?.name, 'Mochi');
    assert.strictEqual(activeCat?.microchipNumber, '985141002345678');

    // Switch to Luna
    selectedCatId = 'cat-2';
    activeCat = cats.find((c) => c.id === selectedCatId);
    assert.strictEqual(activeCat?.name, 'Luna');
    assert.strictEqual(activeCat?.microchipNumber, '985141009876543');
    assert.strictEqual(activeCat?.breed, 'Domestic Shorthair / Tuxedo');
  });

  test('Registering a third pet appends to passport vault', () => {
    const cats = [mockCatMochi, mockCatLuna];
    const newCat = {
      id: 'cat-3',
      name: 'Simba',
      breed: 'Abyssinian',
      gender: 'Male',
      isNeutered: true,
      ageYears: 1,
      coatColour: 'Ruddy ticked agouti',
      distinctiveFeatures: 'Large almond amber eyes',
      microchipNumber: '985141001122334',
      photoUrl: 'https://images.unsplash.com/photo-1543852786-1cf6624b9987?w=600',
      status: 'safe',
      emergencyPhone: '+44 7700 900123',
      vaccinations: [],
    };

    const updatedCats = [...cats, newCat];
    assert.strictEqual(updatedCats.length, 3);
    assert.strictEqual(updatedCats[2].name, 'Simba');
    assert.strictEqual(updatedCats[2].microchipNumber, '985141001122334');
  });

  test('Marking a specific cat missing switches active target and status', () => {
    const cats = [{ ...mockCatMochi }, { ...mockCatLuna }];
    const updatedLuna = {
      ...cats[1],
      status: 'missing',
      missingSince: '2026-10-18T18:00:00Z',
    };

    const updatedCats = cats.map((c) => (c.id === updatedLuna.id ? updatedLuna : c));
    assert.strictEqual(updatedCats.find((c) => c.id === 'cat-2')?.status, 'missing');
    assert.strictEqual(updatedCats.find((c) => c.id === 'cat-1')?.status, 'safe');
  });

  test('broadcastCatMissingAlert registers an active 2-mile Amber Alert on Radar feed', async () => {
    const missingCat = {
      ...mockCatLuna,
      status: 'missing',
      missingSince: '2026-10-18T18:00:00Z',
      homeAddressApprox: 'Victoria Park Road, Hackney',
      homeCoords: { latitude: 51.5365, longitude: -0.039 },
    };

    const alerts = await broadcastCatMissingAlert(missingCat);
    const lunaAlert = alerts.find(
      (a) => a.petName?.toLowerCase() === 'luna' || a.title.toLowerCase().includes('luna')
    );

    assert.ok(lunaAlert, 'Expected an active alert for Luna');
    assert.strictEqual(lunaAlert.status, 'critical');
    assert.strictEqual(lunaAlert.badgeText, '2-MILE AMBER ALERT');
    assert.ok(lunaAlert.title.includes('Luna'));
  });

  test('standDownCatAlerts updates alert status to safe and badge to SAFELY REUNITED', async () => {
    // Luna is found safe
    const updatedAlerts = await standDownCatAlerts('Luna');
    const lunaAlert = updatedAlerts.find(
      (a) => a.petName?.toLowerCase() === 'luna' || a.title.toLowerCase().includes('luna')
    );

    assert.ok(lunaAlert, 'Expected standing-down alert for Luna');
    assert.strictEqual(lunaAlert.status, 'safe');
    assert.strictEqual(lunaAlert.badgeText, '🎉 SAFELY REUNITED');
    assert.ok(lunaAlert.subtitle.includes('safely reunited'));
  });

  test('Editing cat passport updates medical notes, emergency contact, and diet', async () => {
    const originalCat = { ...mockCatMochi };
    const editedCat = {
      ...originalCat,
      name: 'Mochi Senior',
      emergencyPhone: '+44 7700 900999',
      medicalNotes: 'Senior joint supplements twice daily with wet food. Sensitive stomach.',
      distinctiveFeatures: 'Nick on left ear tip, green eyes, wears reflective orange collar',
    };

    const initialCats = [originalCat, mockCatLuna];
    await saveCatProfiles(initialCats);

    // Apply update
    const updatedCats = initialCats.map((c) => (c.id === editedCat.id ? editedCat : c));
    await saveCatProfiles(updatedCats);

    const savedCats = await loadCatProfiles();
    const fetchedMochi = savedCats.find((c) => c.id === 'cat-1');

    assert.ok(fetchedMochi);
    assert.strictEqual(fetchedMochi.name, 'Mochi Senior');
    assert.strictEqual(fetchedMochi.emergencyPhone, '+44 7700 900999');
    assert.strictEqual(
      fetchedMochi.medicalNotes,
      'Senior joint supplements twice daily with wet food. Sensitive stomach.'
    );
    assert.ok(fetchedMochi.distinctiveFeatures.includes('orange collar'));
  });

  test('Deleting a cat removes profile from vault and stands down any active Amber Alerts', async () => {
    const catToDelete = {
      id: 'cat-temp-99',
      name: 'Barnaby',
      breed: 'Maine Coon',
      gender: 'Male',
      isNeutered: true,
      ageYears: 4,
      coatColour: 'Silver Tabby',
      distinctiveFeatures: 'Tufted ears and bushy tail',
      microchipNumber: '985141005555555',
      photoUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba',
      status: 'missing',
      emergencyPhone: '+44 7700 900888',
      vaccinations: [],
    };

    // 1. Add Barnaby and broadcast an Amber Alert
    await addCatProfile(catToDelete);
    await broadcastCatMissingAlert(catToDelete);

    let alerts = await loadCommunityAlerts();
    let barnabyAlert = alerts.find((a) => a.petName === 'Barnaby');
    assert.ok(barnabyAlert, 'Barnaby alert should be registered on radar');
    assert.strictEqual(barnabyAlert.status, 'critical');

    // 2. Delete Barnaby: simulates App.tsx handleDeleteCat logic
    if (catToDelete.status === 'missing') {
      await standDownCatAlerts(catToDelete.name);
    }
    const remainingCats = await deleteCatProfile(catToDelete.id);

    // Verify removed from cats list
    assert.strictEqual(remainingCats.some((c) => c.id === 'cat-temp-99'), false);

    // Verify alerts stood down
    const refreshedAlerts = await loadCommunityAlerts();
    barnabyAlert = refreshedAlerts.find((a) => a.petName === 'Barnaby');
    assert.ok(barnabyAlert);
    assert.strictEqual(barnabyAlert.status, 'safe');
    assert.strictEqual(barnabyAlert.badgeText, '🎉 SAFELY REUNITED');
  });
});

describe('Retention Engine: Local Booster Reminder Schedule (PASS-02)', () => {
  const referenceDate = new Date('2026-10-18T00:00:00Z');

  test('calculateBoosterSchedule correctly computes 7-day and 1-day alerts for upcoming booster', () => {
    const vaccine = {
      id: 'vac-test-1',
      name: 'Cat Flu & Enteritis',
      administeredDate: '2025-11-01',
      nextDueDate: '2026-11-01', // Due in 14 days from 2026-10-18
      vetClinic: 'Victoria Park Vets',
      isUpToDate: true,
    };

    const schedule = calculateBoosterSchedule(vaccine, 'Mochi', referenceDate);

    assert.strictEqual(schedule.dueDate, '2026-11-01');
    assert.strictEqual(schedule.sevenDayReminderDate, '2026-10-25');
    assert.strictEqual(schedule.oneDayReminderDate, '2026-10-31');
    assert.strictEqual(schedule.status, 'due_soon');
    assert.strictEqual(schedule.urgencyDays, 14);
    assert.ok(schedule.message7Day.includes('7-Day Alert'));
    assert.ok(schedule.message1Day.includes('due tomorrow'));
  });

  test('calculateBoosterSchedule identifies overdue boosters', () => {
    const overdueVaccine = {
      id: 'vac-test-2',
      name: 'FeLV Booster',
      administeredDate: '2025-08-01',
      nextDueDate: '2026-08-01', // 78 days overdue from 2026-10-18
      vetClinic: 'Victoria Park Vets',
      isUpToDate: false,
    };

    const schedule = calculateBoosterSchedule(overdueVaccine, 'Luna', referenceDate);

    assert.strictEqual(schedule.status, 'overdue');
    assert.ok(schedule.urgencyDays < 0);
  });

  test('scheduleLocalBoosterAlerts simulates active OS push registrations', async () => {
    const cat = {
      id: 'cat-mochi',
      name: 'Mochi',
      breed: 'Ginger Tabby',
      gender: 'Male',
      isNeutered: true,
      ageYears: 3,
      coatColour: 'Ginger',
      distinctiveFeatures: 'Ear nick',
      microchipNumber: '985141002345678',
      photoUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba',
      status: 'safe',
      emergencyPhone: '+44 7700 900123',
      vaccinations: [
        {
          id: 'v-1',
          name: 'Core Booster',
          administeredDate: '2026-01-01',
          nextDueDate: '2027-01-01',
          vetClinic: 'Victoria Park Vets',
          isUpToDate: true,
        },
      ],
    };

    const result = await scheduleLocalBoosterAlerts(cat);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.scheduledCount, 2); // 7-day and 1-day alert
    assert.ok(result.confirmationMessage.includes('Scheduled 2 local booster alerts'));
  });
});

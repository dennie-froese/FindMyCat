import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLocalReminderDate,
  calculateBoosterSchedule,
  getCatBoosterSchedules,
  scheduleLocalBoosterAlerts,
} from '../src/services/reminderService.ts';
import {
  escapeHtml,
  sanitizeImageUrl,
  generatePosterHtml,
} from '../src/services/posterGenerator.ts';
import {
  UUID_REGEX,
  generateUuid,
  toValidUuid,
  deriveDeterministicUuid,
  uploadPhotoToSupabaseStorage,
  syncVaccinationRecordsToSupabase,
  fetchRemoteCatStatuses,
  syncCatProfileToSupabase,
  submitSightingWithProtection,
  registerPushTokenWithSupabase,
  eraseRemoteAccountData,
} from '../src/services/sightingService.ts';
import {
  standDownCatAlerts,
  broadcastCatMissingAlert,
  loadCommunityAlerts,
  addCatProfile,
  deleteCatProfile,
  loadCatProfiles,
  saveCatProfiles,
  clearAllLocalVaultData,
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

  test('buildLocalReminderDate preserves local calendar day without UTC midnight drift', () => {
    const localTrigger = buildLocalReminderDate('2026-10-25', 9, 0);
    assert.strictEqual(localTrigger.getFullYear(), 2026);
    assert.strictEqual(localTrigger.getMonth(), 9); // October (0-indexed)
    assert.strictEqual(localTrigger.getDate(), 25);
    assert.strictEqual(localTrigger.getHours(), 9);
    assert.strictEqual(localTrigger.getMinutes(), 0);
  });

  test('scheduleLocalBoosterAlerts counts only future reminders when 7-day window has passed', async () => {
    const catDueInThreeDays = {
      id: 'cat-mochi-soon',
      name: 'Mochi',
      breed: 'Ginger Tabby',
      coatColour: 'Ginger',
      distinctiveFeatures: 'Ear nick',
      microchipNumber: '985141002345678',
      photoUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba',
      status: 'safe',
      emergencyPhone: '+44 7700 900123',
      vaccinations: [
        {
          id: 'v-soon-1',
          name: 'Core Booster',
          administeredDate: '2025-10-21',
          nextDueDate: '2026-10-21', // 3 days after referenceDate (2026-10-18)
          vetClinic: 'Victoria Park Vets',
          isUpToDate: true,
        },
      ],
    };

    const result = await scheduleLocalBoosterAlerts(
      catDueInThreeDays,
      new Date(2026, 9, 18, 12, 0, 0)
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.scheduledCount, 1); // Only 1-day alert (2026-10-20 09:00) is in the future
  });
});

describe('PDF Poster Generator: HTML Injection & XSS Protection', () => {
  test('escapeHtml neutralizes HTML tags, quotes, and ampersands', () => {
    assert.strictEqual(
      escapeHtml('<script>alert("xss")</script> & \'single\''),
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &#39;single&#39;'
    );
  });

  test('sanitizeImageUrl allows safe image protocols and blocks javascript: URIs', () => {
    assert.strictEqual(sanitizeImageUrl('javascript:alert(1)'), '');
    assert.strictEqual(sanitizeImageUrl('data:text/html;base64,PHNjcmlwdD4='), '');
    assert.strictEqual(
      sanitizeImageUrl('https://images.unsplash.com/photo-1?a=1&b=2'),
      'https://images.unsplash.com/photo-1?a=1&amp;b=2'
    );
  });

  test('generatePosterHtml escapes all interpolated cat profile fields', () => {
    const xssCat = {
      id: 'cat-xss-1',
      name: 'Mochi <img src=x onerror=alert(1)>',
      breed: 'Tabby & <script>evil()</script>',
      gender: 'Male',
      isNeutered: true,
      ageYears: 3,
      coatColour: 'Ginger "quoted" <b onmouseover=alert(1)>coat</b>',
      distinctiveFeatures: '<svg onload=alert(1)> & <5kg weight',
      microchipNumber: '985141002345678',
      photoUrl: 'javascript:alert("xss")',
      status: 'missing',
      homeAddressApprox: 'St. Mary\'s & <script>hack()</script> Lane',
      medicalNotes: 'Requires <5mg daily & special diet',
      emergencyPhone: '+44 7700 900123" onfocus="alert(1)',
      vaccinations: [],
    };

    const html = generatePosterHtml(xssCat);

    assert.ok(!html.includes('<script>'), 'Generated HTML must not contain unescaped <script> tags');
    assert.ok(!html.includes('<svg onload='), 'Generated HTML must not contain unescaped <svg> tags');
    assert.ok(!html.includes('<img src=x onerror='), 'Generated HTML must not contain injected <img> tags');
    assert.ok(!html.includes('javascript:alert'), 'Generated HTML must block javascript: photo URLs');
    assert.ok(html.includes('&lt;5kg weight'), 'Generated HTML must preserve escaped <5kg text');
    assert.ok(html.includes('St. Mary&#39;s &amp; &lt;script&gt;hack()&lt;/script&gt; Lane'));
  });

  test('generatePosterHtml renders custom poster headline, optional reward badge, and last seen note', () => {
    const customPosterCat = {
      id: 'cat-custom-poster',
      name: 'Mochi',
      breed: 'British Shorthair',
      gender: 'Male',
      coatColour: 'Ginger Tabby',
      distinctiveFeatures: 'White paws',
      microchipNumber: '985141002345678',
      photoUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba',
      status: 'missing',
      emergencyPhone: '+44 7700 900123',
      vaccinations: [],
      posterHeadline: 'Urgent: Missing Indoor Cat',
      posterRewardOffered: true,
      posterRewardText: '£75 Reward Offered',
      posterLastSeenNote: 'Last seen Tuesday 8pm near Victoria Park East Gate',
    };

    const html = generatePosterHtml(customPosterCat);
    assert.ok(html.includes('URGENT: MISSING INDOOR CAT'));
    assert.ok(html.includes('LOST PET ALERT — £75 REWARD OFFERED'));
    assert.ok(html.includes('Last seen Tuesday 8pm near Victoria Park East Gate'));
  });
});

describe('Cloud Sync & UUID Identity Integrity (sightingService & storage)', () => {
  test('generateUuid produces valid RFC-4122 UUIDs compatible with public.cats.id', () => {
    const id1 = generateUuid();
    const id2 = generateUuid();
    assert.match(id1, UUID_REGEX);
    assert.match(id2, UUID_REGEX);
    assert.notStrictEqual(id1, id2);
    assert.strictEqual(toValidUuid(id1), id1);
    assert.strictEqual(toValidUuid('cat-12345'), null);
    assert.strictEqual(toValidUuid('demo'), null);
  });

  test('standDownCatAlerts isolates alerts by catId when two cats share a name', async () => {
    const baseLuna = {
      name: 'Luna',
      breed: 'Domestic Shorthair / Tuxedo',
      gender: 'Female',
      isNeutered: true,
      ageYears: 2,
      coatColour: 'Sleek Black with White Moustache & Paws',
      distinctiveFeatures: 'Distinct asymmetrical white moustache, golden eyes',
      microchipNumber: '985141009876543',
      photoUrl: 'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=600',
      emergencyPhone: '+44 7700 900123',
      vaccinations: [],
    };
    const luna1 = { ...baseLuna, id: generateUuid(), status: 'missing' };
    const luna2 = { ...baseLuna, id: generateUuid(), status: 'missing' };

    await broadcastCatMissingAlert(luna1);
    await broadcastCatMissingAlert(luna2);

    // Stand down only luna1 by its catId
    const updatedAlerts = await standDownCatAlerts('Luna', luna1.id);
    const alert1 = updatedAlerts.find((a) => a.catId === luna1.id);
    const alert2 = updatedAlerts.find((a) => a.catId === luna2.id);

    assert.strictEqual(alert1?.status, 'safe', 'Luna 1 alert should be marked safe');
    assert.strictEqual(alert2?.status, 'critical', 'Luna 2 alert must remain active/critical');
  });

  test('syncCatProfileToSupabase upserts UUID cat profile with PostGIS home_location', async () => {
    let upsertedPayload = null;
    const mockSupabase = {
      auth: {
        getSession: async () => ({
          data: {
            session: {
              access_token: 'mock-jwt-token',
              user: { id: '00000000-0000-4000-8000-000000000001' },
            },
          },
        }),
      },
      from: (table) => {
        assert.strictEqual(table, 'cats');
        return {
          upsert: async (payload) => {
            upsertedPayload = payload;
            return { error: null };
          },
        };
      },
    };

    const catUuid = generateUuid();
    const synced = await syncCatProfileToSupabase(mockSupabase, {
      id: catUuid,
      name: 'Mochi',
      breed: 'British Shorthair / Ginger Tabby',
      gender: 'Male',
      isNeutered: true,
      ageYears: 3,
      coatColour: 'Warm Ginger with White Bib & Paws',
      distinctiveFeatures: 'Small nick on left ear tip',
      microchipNumber: '985141002345678',
      photoUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600',
      status: 'missing',
      emergencyPhone: '+44 7700 900123',
      homeCoords: { latitude: 51.5362, longitude: -0.0385 },
      vaccinations: [],
    });

    assert.strictEqual(synced, true);
    assert.strictEqual(upsertedPayload.id, catUuid);
    assert.strictEqual(upsertedPayload.owner_id, '00000000-0000-4000-8000-000000000001');
    assert.strictEqual(upsertedPayload.status, 'missing');
    assert.strictEqual(upsertedPayload.home_location, 'SRID=4326;POINT(-0.0385 51.5362)');
  });

  test('submitSightingWithProtection falls back to direct PostGIS insert with reporter_id', async () => {
    let insertedSighting = null;
    const expectedSightingId = generateUuid();
    const mockSupabase = {
      auth: {
        getSession: async () => ({
          data: {
            session: {
              access_token: 'mock-jwt-token',
              user: { id: '00000000-0000-4000-8000-000000000099' },
            },
          },
        }),
      },
      from: (table) => {
        assert.strictEqual(table, 'sightings');
        return {
          insert: (payload) => {
            insertedSighting = payload;
            return {
              select: () => ({
                single: async () => ({
                  data: { id: expectedSightingId, jitter_offset_meters: 165 },
                  error: null,
                }),
              }),
            };
          },
        };
      },
    };

    const res = await submitSightingWithProtection(mockSupabase, {
      photoUri: 'https://example.com/spotted.jpg',
      latitude: 51.5375,
      longitude: -0.0392,
      catId: 'non-uuid-cat-1', // should be sanitized to null for PostGIS UUID column
      catNameHint: 'Mochi',
      coatColour: 'Ginger Tabby',
      approximateLocationName: 'Near Victoria Park',
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.sightingId, expectedSightingId);
    assert.strictEqual(res.offsetMeters, 165);
    assert.strictEqual(insertedSighting.reporter_id, '00000000-0000-4000-8000-000000000099');
    assert.strictEqual(insertedSighting.cat_id, null);
    assert.strictEqual(insertedSighting.exact_location, 'SRID=4326;POINT(-0.0392 51.5375)');
  });

  test('uploadPhotoToSupabaseStorage uploads base64 data URI to fmc-photos bucket and returns CDN URL', async () => {
    let uploadedBucket = '';
    let uploadedPath = '';
    let uploadedMime = '';

    const mockSupabase = {
      storage: {
        from: (bucketName) => {
          uploadedBucket = bucketName;
          return {
            upload: async (path, _bytes, opts) => {
              uploadedPath = path;
              uploadedMime = opts.contentType;
              return { error: null };
            },
            getPublicUrl: (path) => ({
              data: { publicUrl: `https://cdn.findmycat.test/storage/v1/object/public/fmc-photos/${path}` },
            }),
          };
        },
      },
    };

    const base64Jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/';
    const publicUrl = await uploadPhotoToSupabaseStorage(mockSupabase, base64Jpeg, 'sightings');

    assert.strictEqual(uploadedBucket, 'fmc-photos');
    assert.match(uploadedPath, /^sightings\/[0-9a-f-]+\.jpg$/i);
    assert.strictEqual(uploadedMime, 'image/jpeg');
    assert.ok(publicUrl.startsWith('https://cdn.findmycat.test/storage/v1/object/public/fmc-photos/sightings/'));
  });

  test('syncVaccinationRecordsToSupabase upserts vaccination records with deterministic UUIDs', async () => {
    let upsertedVaccinations = null;
    const catUuid = generateUuid();

    const mockSupabase = {
      from: (table) => {
        assert.strictEqual(table, 'vaccination_records');
        return {
          upsert: async (rows) => {
            upsertedVaccinations = rows;
            return { error: null };
          },
        };
      },
    };

    const ok = await syncVaccinationRecordsToSupabase(mockSupabase, catUuid, [
      {
        id: 'vac-local-1',
        name: 'Feline Leukaemia (FeLV)',
        administeredDate: '2026-03-10',
        nextDueDate: '2027-03-10',
        vetClinic: 'Victoria Park Vets',
        isUpToDate: true,
      },
    ]);

    assert.strictEqual(ok, true);
    assert.strictEqual(upsertedVaccinations.length, 1);
    assert.match(upsertedVaccinations[0].id, UUID_REGEX);
    assert.strictEqual(
      upsertedVaccinations[0].id,
      deriveDeterministicUuid(`${catUuid}:vac-local-1`)
    );
    assert.strictEqual(upsertedVaccinations[0].cat_id, catUuid);
    assert.strictEqual(upsertedVaccinations[0].vaccine_name, 'Feline Leukaemia (FeLV)');
  });

  test('fetchRemoteCatStatuses retrieves server-side missing status after Stripe webhook activation', async () => {
    const catUuid = generateUuid();
    const mockSupabase = {
      auth: {
        getSession: async () => ({
          data: {
            session: {
              access_token: 'mock-jwt',
              user: { id: '00000000-0000-4000-8000-000000000001' },
            },
          },
        }),
      },
      from: (table) => {
        assert.strictEqual(table, 'cats');
        return {
          select: () => ({
            in: async () => ({
              data: [
                {
                  id: catUuid,
                  status: 'missing',
                  missing_since: '2026-11-09T19:00:00Z',
                },
              ],
              error: null,
            }),
          }),
        };
      },
    };

    const statusMap = await fetchRemoteCatStatuses(mockSupabase, [catUuid]);
    assert.strictEqual(statusMap[catUuid]?.status, 'missing');
    assert.strictEqual(statusMap[catUuid]?.missingSince, '2026-11-09T19:00:00Z');
  });

  test('registerPushTokenWithSupabase upserts Expo Push Token onto public.profiles', async () => {
    let upsertedProfile = null;
    const mockSupabase = {
      auth: {
        getSession: async () => ({
          data: {
            session: {
              access_token: 'mock-jwt',
              user: { id: '00000000-0000-4000-8000-000000000042' },
            },
          },
        }),
      },
      from: (table) => {
        assert.strictEqual(table, 'profiles');
        return {
          upsert: async (payload) => {
            upsertedProfile = payload;
            return { error: null };
          },
        };
      },
    };

    const ok = await registerPushTokenWithSupabase(
      mockSupabase,
      'ExponentPushToken[ios_prod_token_abc123]'
    );
    assert.strictEqual(ok, true);
    assert.strictEqual(upsertedProfile.id, '00000000-0000-4000-8000-000000000042');
    assert.strictEqual(upsertedProfile.expo_push_token, 'ExponentPushToken[ios_prod_token_abc123]');
  });

  test('eraseRemoteAccountData and clearAllLocalVaultData satisfy App Store Guideline 5.1.1(v) account deletion', async () => {
    const deletedTables = [];
    let signedOut = false;

    const mockSupabase = {
      auth: {
        getSession: async () => ({
          data: {
            session: {
              access_token: 'mock-jwt',
              user: { id: '00000000-0000-4000-8000-000000000077' },
            },
          },
        }),
        signOut: async () => {
          signedOut = true;
          return { error: null };
        },
      },
      from: (table) => ({
        delete: () => ({
          eq: async (col, val) => {
            deletedTables.push({ table, col, val });
            return { error: null };
          },
        }),
      }),
    };

    await saveCatProfiles([
      {
        id: generateUuid(),
        name: 'Mochi',
        breed: 'Tabby',
        coatColour: 'Ginger',
        distinctiveFeatures: 'None',
        microchipNumber: '985141002345678',
        photoUrl: 'https://example.com/mochi.jpg',
        status: 'safe',
        emergencyPhone: '+447700900123',
        vaccinations: [],
      },
    ]);

    await clearAllLocalVaultData();
    const catsAfterClear = await loadCatProfiles();
    assert.strictEqual(catsAfterClear.length, 0);

    const remoteErased = await eraseRemoteAccountData(mockSupabase);
    assert.strictEqual(remoteErased, true);
    assert.strictEqual(signedOut, true);
    assert.strictEqual(deletedTables.length, 3);

    // Verify RPC path (delete_my_account) is preferred when available
    let rpcCalled = false;
    const mockSupabaseWithRpc = {
      auth: {
        getSession: async () => ({
          data: {
            session: {
              access_token: 'mock-jwt',
              user: { id: '00000000-0000-4000-8000-000000000088' },
            },
          },
        }),
        signOut: async () => ({ error: null }),
      },
      rpc: async (fnName) => {
        if (fnName === 'delete_my_account') {
          rpcCalled = true;
          return { data: true, error: null };
        }
        return { data: null, error: { message: 'Unknown RPC' } };
      },
    };
    const rpcErased = await eraseRemoteAccountData(mockSupabaseWithRpc);
    assert.strictEqual(rpcErased, true);
    assert.strictEqual(rpcCalled, true);
  });
});

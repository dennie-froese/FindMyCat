import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { CatProfile } from '../types';

/**
 * Generates high-contrast vector HTML template for print-ready lost cat flyers (A4).
 */
export function generatePosterHtml(cat: CatProfile): string {
  // Sighting report link (web fallback flow)
  const baseUrl = process.env.EXPO_PUBLIC_WEB_BASE_URL || 'https://find-my-cat.uk';
  const sightingUrl = `${baseUrl}/sighting/?id=${encodeURIComponent(cat.id)}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
    sightingUrl
  )}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>LOST CAT — ${cat.name}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    body {
      background: #ffffff;
      color: #0f172a;
      padding: 10px;
      text-align: center;
    }
    .header-banner {
      background: #ef4444;
      color: #ffffff;
      padding: 18px 10px;
      border-radius: 8px;
      margin-bottom: 16px;
    }
    .header-banner h1 {
      font-size: 56px;
      font-weight: 900;
      letter-spacing: 4px;
      text-transform: uppercase;
      line-height: 1;
    }
    .header-banner p {
      font-size: 20px;
      font-weight: 700;
      margin-top: 6px;
      letter-spacing: 1px;
    }
    .pet-photo-container {
      margin: 0 auto 16px;
      width: 100%;
      max-width: 420px;
      height: 380px;
      border: 6px solid #0f172a;
      border-radius: 12px;
      overflow: hidden;
      background: #f1f5f9;
    }
    .pet-photo {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .pet-name {
      font-size: 42px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .pet-breed {
      font-size: 22px;
      font-weight: 600;
      color: #64748b;
      margin-bottom: 16px;
    }
    .details-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      text-align: left;
      background: #f8fafc;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 20px;
    }
    .detail-item strong {
      display: block;
      font-size: 13px;
      text-transform: uppercase;
      color: #64748b;
      letter-spacing: 0.5px;
    }
    .detail-item span {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
    }
    .callout-box {
      background: #fef1ee;
      border-left: 6px solid #f05a3e;
      padding: 12px 16px;
      border-radius: 6px;
      text-align: left;
      margin-bottom: 20px;
    }
    .callout-box strong {
      color: #f05a3e;
      font-size: 15px;
    }
    .callout-box p {
      font-size: 16px;
      color: #334155;
      font-weight: 500;
      margin-top: 4px;
    }
    .footer-action {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 4px solid #0f172a;
      padding-top: 16px;
    }
    .phone-block {
      text-align: left;
    }
    .phone-block .label {
      font-size: 15px;
      text-transform: uppercase;
      font-weight: 800;
      color: #ef4444;
      letter-spacing: 1px;
    }
    .phone-block .phone-number {
      font-size: 38px;
      font-weight: 900;
      color: #0f172a;
      letter-spacing: -0.5px;
    }
    .qr-block {
      display: flex;
      align-items: center;
      gap: 12px;
      text-align: right;
    }
    .qr-text {
      font-size: 14px;
      font-weight: 700;
      color: #475569;
      line-height: 1.3;
    }
    .qr-image {
      width: 105px;
      height: 105px;
      border: 3px solid #0f172a;
      border-radius: 6px;
    }
  </style>
</head>
<body>
  <div class="header-banner">
    <h1>PLEASE HELP FIND ME</h1>
    <p>LOST PET ALERT — REWARD OFFERED</p>
  </div>

  <div class="pet-photo-container">
    <img src="${cat.photoUrl}" class="pet-photo" alt="${cat.name}" />
  </div>

  <div class="pet-name">${cat.name.toUpperCase()}</div>
  <div class="pet-breed">${cat.breed} • ${cat.gender}</div>

  <div class="details-grid">
    <div class="detail-item">
      <strong>Coat Colour & Markings</strong>
      <span>${cat.coatColour || cat.coatColor}</span>
    </div>
    <div class="detail-item">
      <strong>Microchip Status</strong>
      <span>Registered with Petlog (${cat.microchipNumber.slice(-6)}****)</span>
    </div>
    <div class="detail-item" style="grid-column: span 2;">
      <strong>Distinctive Identifiers</strong>
      <span>${cat.distinctiveFeatures}</span>
    </div>
  </div>

  <div class="callout-box">
    <strong>LAST SEEN VICINITY:</strong>
    <p>${cat.homeAddressApprox || 'Local neighbourhood area'}</p>
    <p style="margin-top: 6px; font-size: 14px; color: #64748b;">${cat.medicalNotes || 'May be timid and hiding quietly under parked cars, garden decking, or sheds.'}</p>
  </div>

  <div class="footer-action">
    <div class="phone-block">
      <div class="label">IF SEEN, CALL OR TEXT IMMEDIATELY:</div>
      <div class="phone-number">${cat.emergencyPhone}</div>
    </div>
    <div class="qr-block">
      <div class="qr-text">
        SCAN TO REPORT<br>
        ANONYMOUS SIGHTING<br>
        (ZERO APP REQUIRED)
      </div>
      <img src="${qrCodeUrl}" class="qr-image" alt="QR Code to Sighting" />
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Renders the HTML template into a PDF file and opens system share/print dialog.
 */
export async function generateAndSharePoster(cat: CatProfile): Promise<string> {
  const html = generatePosterHtml(cat);
  const { uri } = await Print.printToFileAsync({
    html,
    margins: {
      left: 20,
      top: 20,
      right: 20,
      bottom: 20,
    },
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      UTI: '.pdf',
      mimeType: 'application/pdf',
      dialogTitle: `Print or Share ${cat.name}'s Lost Poster`,
    });
  }

  return uri;
}

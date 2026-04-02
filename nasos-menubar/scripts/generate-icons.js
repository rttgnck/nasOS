#!/usr/bin/env node
/**
 * Converts the nasOS SVG logo into all the raster assets needed for the
 * macOS menu-bar app:
 *
 *   assets/trayIconTemplate.png      16×16  (black-on-transparent, macOS template)
 *   assets/trayIconTemplate@2x.png   32×32
 *   assets/icon.png                  512×512 (full-colour app icon)
 *   assets/icon.icns                 macOS .icns bundle (via iconutil)
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ASSETS = path.join(__dirname, '..', 'assets');
const SVG_PATH = path.join(ASSETS, 'nasos-logo.svg');

const svgFull = fs.readFileSync(SVG_PATH, 'utf-8');

// Template images: replace gradient/colours with solid black
const svgTemplate = svgFull
  .replace(/stop-color="#[^"]+"/g, 'stop-color="#000000"')
  .replace(/fill="url\(#main\)"/g, 'fill="#000000"')
  .replace(/stroke="url\(#main\)"/g, 'stroke="#000000"');

async function main() {
  console.log('Generating tray template icons…');
  await sharp(Buffer.from(svgTemplate))
    .resize(16, 16)
    .png()
    .toFile(path.join(ASSETS, 'trayIconTemplate.png'));

  await sharp(Buffer.from(svgTemplate))
    .resize(32, 32)
    .png()
    .toFile(path.join(ASSETS, 'trayIconTemplate@2x.png'));

  console.log('Generating app icon PNG…');
  await sharp(Buffer.from(svgFull))
    .resize(512, 512)
    .png()
    .toFile(path.join(ASSETS, 'icon.png'));

  // Build .icns via macOS iconutil (skip gracefully on other platforms)
  if (process.platform === 'darwin') {
    console.log('Building .icns via iconutil…');
    const iconset = path.join(ASSETS, 'icon.iconset');
    fs.mkdirSync(iconset, { recursive: true });

    const sizes = [16, 32, 128, 256, 512];
    for (const s of sizes) {
      await sharp(Buffer.from(svgFull))
        .resize(s, s)
        .png()
        .toFile(path.join(iconset, `icon_${s}x${s}.png`));

      if (s <= 512) {
        await sharp(Buffer.from(svgFull))
          .resize(s * 2, s * 2)
          .png()
          .toFile(path.join(iconset, `icon_${s}x${s}@2x.png`));
      }
    }

    execSync(`iconutil -c icns "${iconset}" -o "${path.join(ASSETS, 'icon.icns')}"`, {
      stdio: 'inherit',
    });

    fs.rmSync(iconset, { recursive: true, force: true });
    console.log('Created icon.icns');
  } else {
    console.log('Skipping .icns generation (not macOS)');
  }

  console.log('Done!');
}

main().catch((err) => {
  console.error('Icon generation failed:', err.message);
  process.exit(1);
});

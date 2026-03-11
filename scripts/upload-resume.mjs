import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const HELP_TEXT = `Upload a stored resume PDF to the external candidate platform using Playwright.

Usage:
  npm run upload:resume -- --candidate "Alice"

Options:
  --candidate        Candidate name to match
  --candidate-id     Candidate id to match exactly
  --position         Optional position title filter when candidate names collide
  --app-url          Interview Assistant URL (default: http://127.0.0.1:3000)
  --target           candidate | interview (default: candidate)
  --user-data-dir    Browser user data dir. Must be the same profile family that contains app data and target-site login
  --profile-dir      Chrome profile directory name, e.g. Default or Profile 2
  --headless         Run headless (default: false)
  --timeout          Timeout in ms for navigation and upload actions (default: 30000)

Examples:
  npm run upload:resume -- --candidate "Alice" --position "AI Agent应用工程师" --user-data-dir "$HOME/Library/Application Support/Google/Chrome" --profile-dir Default
  npm run upload:resume -- --candidate-id abc123 --target interview --user-data-dir "$HOME/Library/Application Support/Google/Chrome"
`;

const commonUploadLabels = [
  '上传',
  '上传附件',
  '上传简历',
  '更新简历',
  '重新上传',
  '选择文件',
  '添加附件',
];

function parseArgs(argv) {
  const options = {
    appUrl: process.env.INTERVIEW_ASSISTANT_URL || 'http://127.0.0.1:3000',
    headless: false,
    target: 'candidate',
    timeout: 30_000,
    userDataDir: process.env.PLAYWRIGHT_USER_DATA_DIR || '',
    profileDir: process.env.PLAYWRIGHT_PROFILE_DIR || '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    switch (current) {
      case '--candidate':
        options.candidateName = next;
        index += 1;
        break;
      case '--candidate-id':
        options.candidateId = next;
        index += 1;
        break;
      case '--position':
        options.positionTitle = next;
        index += 1;
        break;
      case '--app-url':
        options.appUrl = next;
        index += 1;
        break;
      case '--target':
        options.target = next;
        index += 1;
        break;
      case '--user-data-dir':
        options.userDataDir = next;
        index += 1;
        break;
      case '--profile-dir':
        options.profileDir = next;
        index += 1;
        break;
      case '--timeout':
        options.timeout = Number(next);
        index += 1;
        break;
      case '--headless':
        options.headless = true;
        break;
      case '--help':
        options.help = true;
        break;
      default:
        if (current.startsWith('--')) {
          throw new Error(`Unknown option: ${current}`);
        }
    }
  }

  return options;
}

function ensureValidOptions(options) {
  if (options.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (!options.userDataDir) {
    throw new Error(
      'Missing --user-data-dir. Point it to the Chrome user data dir that already has Interview Assistant data and the target platform login.'
    );
  }

  if (!options.candidateId && !options.candidateName) {
    throw new Error('Provide either --candidate-id or --candidate.');
  }

  if (!['candidate', 'interview'].includes(options.target)) {
    throw new Error(`Unsupported --target value: ${options.target}`);
  }

  if (!Number.isFinite(options.timeout) || options.timeout <= 0) {
    throw new Error(`Invalid --timeout value: ${options.timeout}`);
  }
}

async function lookupCandidatePayload(page, options) {
  return page.evaluate(async ({ candidateId, candidateName, positionTitle, target }) => {
    const storageKeys = Object.keys(globalThis.localStorage).filter((key) =>
      key.startsWith('interview-assistant-data')
    );

    const openPdfDb = () =>
      new Promise((resolve, reject) => {
        const request = globalThis.indexedDB.open('interview-assistant-pdf', 1);
        request.onerror = () => reject(new Error('Failed to open PDF IndexedDB'));
        request.onsuccess = () => resolve(request.result);
      });

    const getPdfRecord = async (selectedCandidateId) => {
      const db = await openPdfDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(['pdfs'], 'readonly');
        const store = tx.objectStore('pdfs');
        const request = store.get(selectedCandidateId);
        request.onerror = () => reject(new Error('Failed to load candidate PDF'));
        request.onsuccess = () => resolve(request.result || null);
      });
    };

    const bufferToBase64 = (buffer) => {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
      }
      return globalThis.btoa(binary);
    };

    const candidates = [];

    for (const key of storageKeys) {
      try {
        const parsed = JSON.parse(globalThis.localStorage.getItem(key) || 'null');
        const positions = Array.isArray(parsed?.positions) ? parsed.positions : [];

        positions.forEach((position) => {
          (position.candidates || []).forEach((candidate) => {
            candidates.push({
              storageKey: key,
              positionId: position.id,
              positionTitle: position.title,
              positionTeam: position.team || '',
              candidate,
            });
          });
        });
      } catch (error) {
        console.warn('Skipping invalid storage entry:', key, error);
      }
    }

    const matches = candidates.filter(({ candidate, positionTitle: currentPositionTitle }) => {
      const idMatches = candidateId ? candidate.id === candidateId : true;
      const nameMatches = candidateName ? candidate.name === candidateName : true;
      const positionMatches = positionTitle ? currentPositionTitle === positionTitle : true;
      return idMatches && nameMatches && positionMatches;
    });

    if (matches.length === 0) {
      return {
        ok: false,
        error: 'Candidate not found in Interview Assistant local data.',
        candidates: candidates.map(({ candidate, positionTitle: currentPositionTitle }) => ({
          id: candidate.id,
          name: candidate.name,
          positionTitle: currentPositionTitle,
        })),
      };
    }

    if (matches.length > 1) {
      return {
        ok: false,
        error: 'Multiple candidates matched. Refine with --candidate-id or --position.',
        matches: matches.map(({ candidate, positionTitle: currentPositionTitle }) => ({
          id: candidate.id,
          name: candidate.name,
          positionTitle: currentPositionTitle,
        })),
      };
    }

    const selected = matches[0];
    const { candidate, positionTitle: selectedPositionTitle } = selected;
    const targetLink =
      target === 'interview'
        ? candidate.interviewLink || candidate.candidateLink
        : candidate.candidateLink || candidate.interviewLink;

    if (!targetLink) {
      return {
        ok: false,
        error: 'Matched candidate has no stored candidate/interview link. Re-sync calendar first.',
      };
    }

    const pdfRecord = await getPdfRecord(candidate.id);
    if (!pdfRecord?.fileData) {
      return {
        ok: false,
        error: 'Matched candidate has no stored PDF in IndexedDB.',
      };
    }

    return {
      ok: true,
      candidateId: candidate.id,
      candidateName: candidate.name,
      positionTitle: selectedPositionTitle,
      targetLink,
      pdfFilename: pdfRecord.filename || `${candidate.name}.pdf`,
      pdfBase64: bufferToBase64(pdfRecord.fileData),
    };
  }, {
    candidateId: options.candidateId,
    candidateName: options.candidateName,
    positionTitle: options.positionTitle,
    target: options.target,
  });
}

async function waitForFileInput(page, timeout) {
  const selector = 'input[type="file"]';
  try {
    await page.waitForSelector(selector, { timeout });
    return page.locator(selector).first();
  } catch {
    return null;
  }
}

async function triggerUploadChooser(page, timeout) {
  for (const label of commonUploadLabels) {
    const candidates = [
      page.getByRole('button', { name: new RegExp(label, 'i') }).first(),
      page.getByRole('link', { name: new RegExp(label, 'i') }).first(),
      page.getByText(new RegExp(label, 'i')).first(),
      page.locator(`label:has-text("${label}")`).first(),
    ];

    for (const locator of candidates) {
      try {
        if (!(await locator.isVisible({ timeout: 500 }))) {
          continue;
        }
      } catch {
        continue;
      }

      try {
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout }),
          locator.click({ timeout }),
        ]);
        return fileChooser;
      } catch {
        // Continue trying other selectors.
      }
    }
  }

  return null;
}

async function uploadResume(page, pdfPath, timeout) {
  let fileInput = await waitForFileInput(page, 3_000);
  if (fileInput) {
    await fileInput.setInputFiles(pdfPath);
    return 'input[type=file]';
  }

  const fileChooser = await triggerUploadChooser(page, timeout);
  if (fileChooser) {
    await fileChooser.setFiles(pdfPath);
    return 'filechooser';
  }

  fileInput = await waitForFileInput(page, 3_000);
  if (fileInput) {
    await fileInput.setInputFiles(pdfPath);
    return 'delayed input[type=file]';
  }

  throw new Error(
    'Could not find a file input or upload trigger on the target page. You may need to adjust selectors in scripts/upload-resume.mjs.'
  );
}

async function saveTempPdf(payload) {
  const safeFilename = payload.pdfFilename.replace(/[^\w.-]+/g, '_');
  const pdfPath = path.join(os.tmpdir(), `interview-assistant-${payload.candidateId}-${safeFilename}`);
  await fs.writeFile(pdfPath, Buffer.from(payload.pdfBase64, 'base64'));
  return pdfPath;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  ensureValidOptions(options);

  const launchArgs = [];
  if (options.profileDir) {
    launchArgs.push(`--profile-directory=${options.profileDir}`);
  }

  const context = await chromium.launchPersistentContext(options.userDataDir, {
    channel: 'chrome',
    headless: options.headless,
    args: launchArgs,
    viewport: null,
  });

  let tempPdfPath = '';

  try {
    const appPage = context.pages()[0] || (await context.newPage());
    await appPage.goto(options.appUrl, {
      waitUntil: 'domcontentloaded',
      timeout: options.timeout,
    });

    const payload = await lookupCandidatePayload(appPage, options);
    if (!payload.ok) {
      throw new Error(`${payload.error}\n${JSON.stringify(payload.matches || payload.candidates || [], null, 2)}`);
    }

    tempPdfPath = await saveTempPdf(payload);

    const targetPage = await context.newPage();
    await targetPage.goto(payload.targetLink, {
      waitUntil: 'domcontentloaded',
      timeout: options.timeout,
    });

    const uploadMethod = await uploadResume(targetPage, tempPdfPath, options.timeout);

    console.log(`Uploaded resume for ${payload.candidateName} (${payload.positionTitle}) using ${uploadMethod}.`);
    console.log(`Target page: ${payload.targetLink}`);
    console.log('If the site requires a final confirmation click, complete it manually in the opened browser.');
  } finally {
    if (tempPdfPath) {
      try {
        await fs.unlink(tempPdfPath);
      } catch {
        // Ignore cleanup failures for temp files.
      }
    }
    await context.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

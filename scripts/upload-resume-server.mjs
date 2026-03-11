import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

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
    host: '127.0.0.1',
    port: 3456,
    headless: false,
    timeout: 30_000,
    userDataDir: process.env.PLAYWRIGHT_USER_DATA_DIR || '',
    profileDir: process.env.PLAYWRIGHT_PROFILE_DIR || '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    switch (current) {
      case '--host':
        options.host = next;
        index += 1;
        break;
      case '--port':
        options.port = Number(next);
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
        console.log(
          'Usage: npm run upload:resume-server -- --user-data-dir "$HOME/Library/Application Support/Google/Chrome" --profile-dir Default'
        );
        process.exit(0);
        break;
      default:
        if (current.startsWith('--')) {
          throw new Error(`Unknown option: ${current}`);
        }
    }
  }

  if (!options.userDataDir) {
    throw new Error('Missing --user-data-dir. This should point to your Chrome user data directory.');
  }

  return options;
}

async function waitForFileInput(page, timeout) {
  try {
    await page.waitForSelector('input[type="file"]', { timeout });
    return page.locator('input[type="file"]').first();
  } catch {
    return null;
  }
}

async function triggerUploadChooser(page, timeout) {
  for (const label of commonUploadLabels) {
    const locators = [
      page.getByRole('button', { name: new RegExp(label, 'i') }).first(),
      page.getByRole('link', { name: new RegExp(label, 'i') }).first(),
      page.getByText(new RegExp(label, 'i')).first(),
      page.locator(`label:has-text("${label}")`).first(),
    ];

    for (const locator of locators) {
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
        // Try next locator.
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

  throw new Error('Could not locate an upload control on the target page.');
}

async function withBrowser(options, task) {
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

  try {
    return await task(context);
  } finally {
    await context.close();
  }
}

async function handleUpload(payload, options) {
  if (!payload?.pdfBase64 || !payload?.targetLink) {
    throw new Error('Missing required fields: pdfBase64 and targetLink.');
  }

  const safeFilename = (payload.pdfFilename || 'resume.pdf').replace(/[^\w.-]+/g, '_');
  const tempPdfPath = path.join(os.tmpdir(), `interview-assistant-${payload.candidateId || Date.now()}-${safeFilename}`);
  await fs.writeFile(tempPdfPath, Buffer.from(payload.pdfBase64, 'base64'));

  try {
    return await withBrowser(options, async (context) => {
      const page = await context.newPage();
      await page.goto(payload.targetLink, {
        waitUntil: 'domcontentloaded',
        timeout: options.timeout,
      });
      const uploadMethod = await uploadResume(page, tempPdfPath, options.timeout);
      return {
        success: true,
        message: `Uploaded resume for ${payload.candidateName || payload.candidateId} using ${uploadMethod}. Complete any final confirmation directly in the opened page if needed.`,
      };
    });
  } finally {
    try {
      await fs.unlink(tempPdfPath);
    } catch {
      // Ignore cleanup failures.
    }
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const server = http.createServer(async (request, response) => {
    if (request.method === 'OPTIONS') {
      sendJson(response, 204, {});
      return;
    }

    if (request.method === 'POST' && request.url === '/upload-resume') {
      try {
        const payload = await readJsonBody(request);
        const result = await handleUpload(payload, options);
        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, 500, {
          success: false,
          message: error instanceof Error ? error.message : 'Unknown upload error',
        });
      }
      return;
    }

    sendJson(response, 404, { success: false, message: 'Not found' });
  });

  server.listen(options.port, options.host, () => {
    console.log(`Resume upload bridge listening on http://${options.host}:${options.port}`);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

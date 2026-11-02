import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const rootConfigPath = path.join(rootDir, 'firebase-applet-config.json');
const srcConfigPath = path.join(rootDir, 'src', 'firebase-applet-config.json');
const rootGoogleServicesPath = path.join(rootDir, 'google-services.json');
const androidAppDir = path.join(rootDir, 'android', 'app');
const androidGoogleServicesPath = path.join(androidAppDir, 'google-services.json');

function readJsonIfExists(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8').trim();
      if (raw) return JSON.parse(raw);
    }
  } catch (err) {
    console.warn(`[firebase-sync] Could not parse ${filePath}:`, err.message);
  }
  return null;
}

function extractFromGoogleServices(gs) {
  if (!gs || typeof gs !== 'object') return null;
  const projectInfo = gs.project_info || {};
  const client = Array.isArray(gs.client) ? gs.client[0] : null;
  const clientInfo = client?.client_info || {};
  const apiKeyEntry = Array.isArray(client?.api_key) ? client.api_key[0] : null;
  const oauthClient = Array.isArray(client?.oauth_client) ? client.oauth_client[0] : null;

  if (!projectInfo.project_id || !apiKeyEntry?.current_key) return null;

  return {
    projectId: projectInfo.project_id,
    appId: clientInfo.mobilesdk_app_id || '',
    apiKey: apiKeyEntry.current_key,
    authDomain: `${projectInfo.project_id}.firebaseapp.com`,
    storageBucket: projectInfo.storage_bucket || `${projectInfo.project_id}.firebasestorage.app`,
    messagingSenderId: projectInfo.project_number || '',
    oAuthClientId: oauthClient?.client_id || '',
  };
}

// 1. Discover existing Firebase configuration automatically
const rootConfig = readJsonIfExists(rootConfigPath);
const srcConfig = readJsonIfExists(srcConfigPath);
const googleServices =
  readJsonIfExists(rootGoogleServicesPath) || readJsonIfExists(androidGoogleServicesPath);
const gsExtracted = extractFromGoogleServices(googleServices);

const activeConfig = rootConfig || srcConfig || gsExtracted;

if (activeConfig && activeConfig.projectId && activeConfig.apiKey) {
  const mergedConfig = {
    ...(gsExtracted || {}),
    ...(srcConfig || {}),
    ...(rootConfig || {}),
  };

  const formatted = JSON.stringify(mergedConfig, null, 2) + '\n';
  fs.mkdirSync(path.dirname(srcConfigPath), { recursive: true });

  if (!fs.existsSync(rootConfigPath) || fs.readFileSync(rootConfigPath, 'utf8') !== formatted) {
    fs.writeFileSync(rootConfigPath, formatted, 'utf8');
  }
  if (!fs.existsSync(srcConfigPath) || fs.readFileSync(srcConfigPath, 'utf8') !== formatted) {
    fs.writeFileSync(srcConfigPath, formatted, 'utf8');
  }

  console.log(
    `[firebase-sync] Active Firebase project verified: ${mergedConfig.projectId} (Firestore DB: ${mergedConfig.firestoreDatabaseId || '(default)'})`
  );
} else {
  console.warn('[firebase-sync] No Firebase configuration file found to sync.');
}

// 2. Sync google-services.json into android/app/ automatically when Android directory exists
if (fs.existsSync(androidAppDir)) {
  if (
    process.env.GOOGLE_SERVICES_JSON &&
    process.env.GOOGLE_SERVICES_JSON.trim().startsWith('{') &&
    !fs.existsSync(androidGoogleServicesPath)
  ) {
    fs.writeFileSync(
      androidGoogleServicesPath,
      process.env.GOOGLE_SERVICES_JSON.trim() + '\n',
      'utf8'
    );
    console.log('[firebase-sync] Provisioned android/app/google-services.json from CI environment.');
  } else if (fs.existsSync(rootGoogleServicesPath) && !fs.existsSync(androidGoogleServicesPath)) {
    fs.copyFileSync(rootGoogleServicesPath, androidGoogleServicesPath);
    console.log('[firebase-sync] Copied google-services.json to android/app/google-services.json.');
  }
}

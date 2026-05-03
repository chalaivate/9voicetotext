import keytar from 'keytar';
import { logger } from '@main/utils/logger';

const SERVICE = '9voicetotext';
const ACCOUNT_OPENAI = 'openai-api-key';

export async function setApiKey(key: string): Promise<void> {
  if (!key || !key.trim()) {
    throw new Error('API key cannot be empty.');
  }
  await keytar.setPassword(SERVICE, ACCOUNT_OPENAI, key.trim());
  logger.info('api key stored in keychain');
}

export async function getApiKey(): Promise<string | null> {
  try {
    return await keytar.getPassword(SERVICE, ACCOUNT_OPENAI);
  } catch (err) {
    logger.error('keychain read failed', { err: (err as Error).message });
    return null;
  }
}

export async function deleteApiKey(): Promise<void> {
  await keytar.deletePassword(SERVICE, ACCOUNT_OPENAI);
  logger.info('api key deleted from keychain');
}

export async function hasApiKey(): Promise<boolean> {
  const key = await getApiKey();
  return key !== null && key.length > 0;
}

/** Mask a key for safe display in the UI: returns "sk-…1234" or "(empty)". */
export function maskKey(key: string | null | undefined): string {
  if (!key) return '(no key set)';
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '****';
  return `${trimmed.slice(0, 3)}…${trimmed.slice(-4)}`;
}

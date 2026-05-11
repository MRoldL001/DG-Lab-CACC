import * as vscode from 'vscode';

export interface AIConfig {
  provider: 'local' | 'remote';
  systemPrompt: string;
  local?: {
    model: string;
  };
  remote?: {
    endpoint: string;
    apiKey: string;
    model: string;
  };
}

export function getScoreCheckerConfig(): AIConfig {
  const config = vscode.workspace.getConfiguration('codeChecker');
  return {
    provider: config.get<'local' | 'remote'>('aiProvider', 'local'),
    systemPrompt: config.get<string>('systemPrompt', ''),
    local: {
      model: config.get<string>('local.model', 'llama2')
    },
    remote: {
      endpoint: config.get<string>('remote.endpoint', ''),
      apiKey: config.get<string>('remote.apiKey', ''),
      model: config.get<string>('remote.model', '')
    }
  };
}

export function isScoreCheckerAvailable(): boolean {
  const extension = vscode.extensions.getExtension('MRoldL001.chobits-ai-code-checker');
  return extension !== undefined && extension.isActive;
}

export async function getCurrentScore(): Promise<number> {
  const extension = vscode.extensions.getExtension('MRoldL001.chobits-ai-code-checker');

  if (!extension) {
    return -1;
  }

  if (!extension.isActive) {
    await extension.activate();
  }

  const api = extension.exports;
  if (api && typeof api.getCurrentScore === 'function') {
    return api.getCurrentScore();
  }

  return -1;
}

export async function checkCodeQuality(): Promise<number> {
  const extension = vscode.extensions.getExtension('MRoldL001.chobits-ai-code-checker');

  if (!extension) {
    return -1;
  }

  if (!extension.isActive) {
    await extension.activate();
  }

  const api = extension.exports;
  if (api && typeof api.checkCodeQuality === 'function') {
    return await api.checkCodeQuality();
  }

  return -1;
}

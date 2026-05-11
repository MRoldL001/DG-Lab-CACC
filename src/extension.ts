import * as vscode from 'vscode';
import { DGLabService, ConnectionStatus, DGLabConfig } from './dgLabService';
import { SidebarProvider } from './sidebar';
import { getCurrentScore, isScoreCheckerAvailable } from './aiConfigReader';

let dgLabService: DGLabService;
let sidebarProvider: SidebarProvider;
let statusBarItem: vscode.StatusBarItem;
let currentStimulating: boolean = false;

const WOLF_EMOJI = '🐺';
const BOLT_EMOJI = '⚡';

export function activate(context: vscode.ExtensionContext) {
  const config = getDGLabConfig();
  dgLabService = new DGLabService(config);

  statusBarItem = vscode.window.createStatusBarItem(
    getAlignment(config.statusBarPosition),
    getScoreCheckerPriority() - 1
  );
  statusBarItem.text = WOLF_EMOJI;
  statusBarItem.tooltip = 'DG-Lab: 点击打开控制面板';
  statusBarItem.command = 'dgLabCacc.openSidebar';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  sidebarProvider = new SidebarProvider(context, dgLabService);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('dgLabCaccMainView', sidebarProvider)
  );

  const openSidebarCmd = vscode.commands.registerCommand('dgLabCacc.openSidebar', () => {
    vscode.commands.executeCommand('dgLabCaccMainView.focus');
  });
  context.subscriptions.push(openSidebarCmd);

  const emergencyStopCmd = vscode.commands.registerCommand('dgLabCacc.emergencyStop', () => {
    dgLabService.emergencyStop();
    vscode.window.showInformationMessage('已发送紧急停止指令');
  });
  context.subscriptions.push(emergencyStopCmd);

  const disconnectCmd = vscode.commands.registerCommand('dgLabCacc.disconnect', () => {
    dgLabService.disconnect();
    vscode.window.showInformationMessage('已断开连接');
  });
  context.subscriptions.push(disconnectCmd);

  const toggleConnectionCmd = vscode.commands.registerCommand('dgLabCacc.toggleConnection', async () => {
    const status = dgLabService.getConnectionStatus();
    if (status.isConnected) {
      dgLabService.disconnect();
    } else {
      await dgLabService.connect();
    }
  });
  context.subscriptions.push(toggleConnectionCmd);

  vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('dgLabCacc')) {
      const newConfig = getDGLabConfig();
      dgLabService.setConfig(newConfig);
      updateStatusBarAlignment(newConfig.statusBarPosition);
      sidebarProvider.updateConfig(newConfig);
    }
  });

  startScoreMonitoring();

  vscode.window.showInformationMessage('DG-Lab CACC 已激活！');
}

function startScoreMonitoring() {
  vscode.window.onDidChangeActiveTextEditor(() => {
    checkAndStimulate();
  });

  vscode.workspace.onDidChangeTextDocument(() => {
    debouncedCheck();
  });

  setTimeout(() => checkAndStimulate(), 1000);
}

let checkTimer: NodeJS.Timeout | null = null;
function debouncedCheck() {
  if (checkTimer) {
    clearTimeout(checkTimer);
  }
  checkTimer = setTimeout(() => {
    checkAndStimulate();
  }, 2000);
}

async function checkAndStimulate() {
  if (!isScoreCheckerAvailable()) {
    return;
  }

  const score = await getCurrentScore();
  if (score < 0) {
    return;
  }

  const config = getDGLabConfig();

  if (score < config.threshold) {
    triggerStimulus(score, config);
  }
}

function triggerStimulus(score: number, config: DGLabConfig) {
  if (!dgLabService.getConnectionStatus().isConnected) {
    return;
  }

  if (currentStimulating) {
    return;
  }

  currentStimulating = true;
  statusBarItem.text = BOLT_EMOJI;

  const strength = calculateStrength(score, config.threshold, config.maxStrength);
  dgLabService.setStrength(strength);

  dgLabService.sendWaveform(getSimpleWaveform());

  setTimeout(() => {
    dgLabService.emergencyStop();
    currentStimulating = false;
    statusBarItem.text = WOLF_EMOJI;
  }, config.stimDuration * 1000);
}

function calculateStrength(score: number, threshold: number, maxStrength: number): number {
  if (score >= threshold) {
    return 0;
  }
  const ratio = (threshold - score) / threshold;
  return Math.round(ratio * maxStrength);
}

function getSimpleWaveform(): string[] {
  return [
    '0A0A0A0A64646464',
    '0A0A0A0A64646464',
    '0A0A0A0A64646464',
    '0A0A0A0A64646464',
    '0A0A0A0A64646464',
    '0A0A0A0A64646464',
    '0A0A0A0A64646464',
    '0A0A0A0A64646464',
    '0A0A0A0A64646464',
    '0A0A0A0A64646464',
    '1E1E1E1E64646464',
    '1E1E1E1E64646464',
    '1E1E1E1E64646464',
    '1E1E1E1E64646464',
    '1E1E1E1E64646464',
    '1E1E1E1E64646464',
    '1E1E1E1E64646464',
    '1E1E1E1E64646464',
    '1E1E1E1E64646464',
    '1E1E1E1E64646464'
  ];
}

function getDGLabConfig(): DGLabConfig & { statusBarPosition: 'left' | 'right' } {
  const config = vscode.workspace.getConfiguration('dgLabCacc');
  return {
    wsServer: config.get<string>('wsServer', 'wss://your-server.com:9999'),
    threshold: config.get<number>('threshold', 60),
    maxStrength: config.get<number>('maxStrength', 100),
    stimDuration: config.get<number>('stimDuration', 5),
    channel: config.get<'A' | 'B'>('channel', 'A'),
    statusBarPosition: vscode.workspace.getConfiguration('codeChecker').get<'left' | 'right'>('statusBarPosition', 'right')
  };
}

function getScoreCheckerPriority(): number {
  return 100;
}

function getAlignment(position: 'left' | 'right'): vscode.StatusBarAlignment {
  return position === 'left' ? vscode.StatusBarAlignment.Left : vscode.StatusBarAlignment.Right;
}

function updateStatusBarAlignment(position: 'left' | 'right') {
  const newAlignment = getAlignment(position);
  if (statusBarItem.alignment !== newAlignment) {
    statusBarItem.dispose();
    statusBarItem = vscode.window.createStatusBarItem(newAlignment, getScoreCheckerPriority() - 1);
    statusBarItem.text = WOLF_EMOJI;
    statusBarItem.tooltip = 'DG-Lab: 点击打开控制面板';
    statusBarItem.command = 'dgLabCacc.openSidebar';
    statusBarItem.show();
  }
}

export function deactivate() {
  if (dgLabService) {
    dgLabService.disconnect();
  }
}

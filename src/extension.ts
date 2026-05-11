import * as vscode from 'vscode';
import { DGLabService, ConnectionStatus, DGLabConfig } from './dgLabService';
import { getCurrentScore, isScoreCheckerAvailable } from './aiConfigReader';

let dgLabService: DGLabService;
let statusBarItem: vscode.StatusBarItem;
let currentStimulating: boolean = false;
let panel: vscode.WebviewPanel | undefined;

const WOLF_EMOJI = '🐺';
const BOLT_EMOJI = '⚡';

const DISCLAIMER_MESSAGE = `DG-Lab CACC 免责声明

使用本插件即表示您同意以下条款：

1. 与官方无关：本插件为第三方开发，与郊狼官方（DG-LAB）无任何关联
2. 医疗建议：如您有心脏病、癫痫、植入式医疗设备（如心脏起搏器）等健康问题，使用前请咨询医生
3. 年龄限制：本插件仅限18岁以上的成年人使用，未成年人禁止使用
4. 学习目的：本插件仅供学习研究目的使用
5. 硬件设备风险：郊狼主机为电击设备，本插件通过软件控制硬件输出电刺激，存在一定安全风险
6. 人身安全：本插件代码所提供的电击控制强度波形等未经充分的物理测试，安全性需使用者自行审查
7. 责任声明：使用本插件导致的任何身体伤害、财产损失或其他任何后果，作者不承担任何责任
8. 使用风险：请确保在安全可控的环境下使用，电击阈值建议从低到高逐步调整，身体不适请立即停止使用

是否同意以上条款？`;

export function activate(context: vscode.ExtensionContext) {
  const agreed = context.globalState.get<boolean>('dgLabCacc.disclaimerAgreed');
  
  if (!agreed) {
    vscode.window.showWarningMessage(DISCLAIMER_MESSAGE, '同意并继续', '不同意').then((choice) => {
      if (choice === '同意并继续') {
        context.globalState.update('dgLabCacc.disclaimerAgreed', true);
        activateExtension(context);
      } else {
        vscode.window.showInformationMessage('插件已停用，如需启用请重新安装');
      }
    });
    return;
  }
  
  activateExtension(context);
}

function activateExtension(context: vscode.ExtensionContext) {
  try {
    const config = getDGLabConfig();
    dgLabService = new DGLabService(config);

    statusBarItem = vscode.window.createStatusBarItem(
      getAlignment(config.statusBarPosition),
      getScoreCheckerPriority() - 1
    );
    statusBarItem.text = WOLF_EMOJI;
    statusBarItem.tooltip = '打开控制面板';
    statusBarItem.command = 'dgLabCacc.openPanel';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    const openPanelCmd = vscode.commands.registerCommand('dgLabCacc.openPanel', () => {
      showPanel(context);
    });
    context.subscriptions.push(openPanelCmd);

    const resetDisclaimerCmd = vscode.commands.registerCommand('dgLabCacc.resetDisclaimer', () => {
      context.globalState.update('dgLabCacc.disclaimerAgreed', undefined);
      vscode.window.showInformationMessage('已重置免责条款同意状态，重启VSCode后将重新显示');
    });
    context.subscriptions.push(resetDisclaimerCmd);

    const emergencyStopCmd = vscode.commands.registerCommand('dgLabCacc.emergencyStop', () => {
      dgLabService.emergencyStop();
      vscode.window.showInformationMessage('已发送紧急停止指令');
    });
    context.subscriptions.push(emergencyStopCmd);

    const disconnectCmd = vscode.commands.registerCommand('dgLabCacc.disconnect', () => {
      dgLabService.disconnect();
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
        if (panel) {
          updatePanelConfig(newConfig);
        }
      }

      if (event.affectsConfiguration('codeChecker.statusBarPosition')) {
        const newConfig = getDGLabConfig();
        updateStatusBarAlignment(newConfig.statusBarPosition);
      }
    });

    startScoreMonitoring();
  } catch (error) {
    console.error('DG-Lab CACC activation error:', error);
    vscode.window.showErrorMessage(`DG-Lab CACC 激活失败: ${error}`);
  }
}

function showPanel(context: vscode.ExtensionContext) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside);
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'dgLabCaccPanel',
    'DG-Lab CACC',
    {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: false
    },
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  panel.webview.html = getPanelHtml();

  panel.webview.onDidReceiveMessage((message) => {
    handlePanelMessage(message);
  });

  panel.onDidDispose(() => {
    panel = undefined;
  });

  dgLabService.onStatusUpdate((status) => {
    if (panel) {
      panel.webview.postMessage({ command: 'updateStatus', status });
    }
  });

  dgLabService.onStrengthUpdate((a, b, aLimit, bLimit) => {
    if (panel) {
      panel.webview.postMessage({ command: 'updateStrength', a, b, aLimit, bLimit });
    }
  });

  panel.webview.postMessage({ command: 'updateStatus', status: dgLabService.getConnectionStatus() });
  panel.webview.postMessage({ command: 'updateConfig', config: getDGLabConfig() });
}

function handlePanelMessage(message: { command: string }) {
  switch (message.command) {
    case 'generateQR':
      const url = dgLabService.generateQRCodeUrl();
      panel?.webview.postMessage({ command: 'showQR', url });
      break;
    case 'emergencyStop':
      dgLabService.emergencyStop();
      break;
    case 'disconnect':
      dgLabService.disconnect();
      break;
  }
}

function updatePanelConfig(config: DGLabConfig) {
  panel?.webview.postMessage({ command: 'updateConfig', config });
}

function getPanelHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      padding: 16px;
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      min-height: 400px;
    }
    .section {
      margin-bottom: 20px;
      padding: 12px;
      background: var(--vscode-sideBar-background);
      border-radius: 6px;
    }
    .section h2 {
      margin: 0 0 8px 0;
      font-size: 18px;
    }
    .section h3 {
      margin: 0 0 12px 0;
      font-size: 14px;
    }
    .status-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .label {
      color: var(--vscode-foreground);
      opacity: 0.8;
    }
    .status {
      font-weight: bold;
      padding: 2px 8px;
      border-radius: 4px;
    }
    .connected {
      background: #2ea043;
      color: white;
    }
    .disconnected {
      background: #d35400;
      color: white;
    }
    .qr-section {
      text-align: center;
    }
    .qr-section p {
      margin: 8px 0;
      color: var(--vscode-foreground);
      opacity: 0.7;
    }
    .qrcode-container {
      margin: 16px 0;
      min-height: 200px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .qrcode-container img {
      max-width: 200px;
      border: 4px solid white;
      border-radius: 8px;
    }
    .hint {
      color: var(--vscode-foreground);
      opacity: 0.5;
    }
    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: bold;
      margin: 4px;
    }
    .btn-primary {
      background: #3794ff;
      color: white;
    }
    .btn-danger {
      background: #ff3b30;
      color: white;
    }
    .btn-warning {
      background: #d35400;
      color: white;
    }
    .button-group {
      display: flex;
      gap: 8px;
      margin-top: 16px;
      flex-wrap: wrap;
    }
    .param-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 16px;
    }
    .param-item {
      background: var(--vscode-editor-background);
      padding: 8px;
      border-radius: 4px;
      text-align: center;
    }
    .param-label {
      display: block;
      font-size: 11px;
      color: var(--vscode-foreground);
      opacity: 0.7;
    }
    .param-value {
      display: block;
      font-size: 16px;
      font-weight: bold;
      color: #3794ff;
    }
    .strength-display {
      margin-top: 16px;
    }
    .strength-display h4 {
      margin: 0 0 8px 0;
      font-size: 12px;
    }
    .strength-bar {
      margin-bottom: 8px;
    }
    .bar-label {
      display: inline-block;
      width: 40px;
      font-size: 12px;
    }
    .bar-container {
      display: inline-block;
      width: calc(100% - 100px);
      height: 12px;
      background: var(--vscode-editor-background);
      border-radius: 6px;
      overflow: hidden;
      vertical-align: middle;
    }
    .bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #2ea043, #c9a227, #ff3b30);
      transition: width 0.3s ease;
    }
    .bar-value {
      display: inline-block;
      width: 50px;
      text-align: right;
      font-size: 12px;
    }
    .info-text {
      font-size: 11px;
      color: var(--vscode-foreground);
      opacity: 0.6;
      text-align: center;
    }
    .info-text p {
      margin: 4px 0;
    }
  </style>
</head>
<body>
  <div class="section">
    <h2>DG-Lab CACC</h2>
  </div>

  <div class="section connection-section">
    <div class="status-row">
      <span class="label">连接状态:</span>
      <span id="connectionStatus" class="status disconnected">未连接</span>
    </div>
    <div class="status-row">
      <span class="label">设备ID:</span>
      <span id="clientId" class="value">-</span>
    </div>
    <div id="targetSection" class="status-row" style="display:none;">
      <span class="label">APP ID:</span>
      <span id="targetId" class="value">-</span>
    </div>
  </div>

  <div id="qrSection" class="section qr-section">
    <h2>连接设备</h2>
    <p>扫描下方二维码连接 DG-Lab APP</p>
    <div id="qrcode" class="qrcode-container">
      <p class="hint">点击"生成连接码"按钮</p>
    </div>
    <button id="generateQR" class="btn btn-primary">生成连接码</button>
  </div>

  <div id="controlSection" class="section" style="display:none;">
    <h3>⚡ 当前参数</h3>
    <div class="param-grid">
      <div class="param-item">
        <span class="param-label">阈值</span>
        <span id="threshold" class="param-value">60</span>
      </div>
      <div class="param-item">
        <span class="param-label">最大强度</span>
        <span id="maxStrength" class="param-value">100</span>
      </div>
      <div class="param-item">
        <span class="param-label">刺激时长</span>
        <span id="stimDuration" class="param-value">5秒</span>
      </div>
      <div class="param-item">
        <span class="param-label">通道</span>
        <span id="channel" class="param-value">A</span>
      </div>
    </div>

    <div class="strength-display">
      <h4>实时强度</h4>
      <div class="strength-bars">
        <div class="strength-bar">
          <span class="bar-label">A通道</span>
          <div class="bar-container">
            <div id="strengthA" class="bar-fill" style="width: 0%"></div>
          </div>
          <span id="strengthAValue" class="bar-value">0/200</span>
        </div>
        <div class="strength-bar">
          <span class="bar-label">B通道</span>
          <div class="bar-container">
            <div id="strengthB" class="bar-fill" style="width: 0%"></div>
          </div>
          <span id="strengthBValue" class="bar-value">0/200</span>
        </div>
      </div>
    </div>

    <div class="button-group">
      <button id="emergencyStop" class="btn btn-danger">🛑 紧急停止</button>
      <button id="disconnect" class="btn btn-warning">断开连接</button>
    </div>
  </div>


  <script>
    const vscode = acquireVsCodeApi();

    document.getElementById('generateQR').addEventListener('click', () => {
      vscode.postMessage({ command: 'generateQR' });
    });

    document.getElementById('emergencyStop').addEventListener('click', () => {
      vscode.postMessage({ command: 'emergencyStop' });
    });

    document.getElementById('disconnect').addEventListener('click', () => {
      vscode.postMessage({ command: 'disconnect' });
    });

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.command === 'updateStatus') {
        updateConnectionStatus(message.status);
      } else if (message.command === 'updateStrength') {
        updateStrengthDisplay(message.a, message.b, message.aLimit, message.bLimit);
      } else if (message.command === 'showQR') {
        showQRCode(message.url);
      } else if (message.command === 'updateConfig') {
        updateConfigDisplay(message.config);
      }
    });

    function updateConnectionStatus(status) {
      const statusEl = document.getElementById('connectionStatus');
      const clientIdEl = document.getElementById('clientId');
      const targetIdEl = document.getElementById('targetId');
      const qrSection = document.getElementById('qrSection');
      const controlSection = document.getElementById('controlSection');
      const targetSection = document.getElementById('targetSection');

      clientIdEl.textContent = status.clientId || '-';

      if (status.isConnected) {
        statusEl.textContent = '已连接';
        statusEl.className = 'status connected';
        qrSection.style.display = 'none';

        if (status.targetId) {
          targetIdEl.textContent = status.targetId;
          targetSection.style.display = 'flex';
          controlSection.style.display = 'block';
        } else {
          targetSection.style.display = 'none';
          controlSection.style.display = 'none';
          qrSection.style.display = 'block';
        }
      } else {
        statusEl.textContent = '未连接';
        statusEl.className = 'status disconnected';
        qrSection.style.display = 'block';
        controlSection.style.display = 'none';
        targetSection.style.display = 'none';
      }
    }

    function updateStrengthDisplay(a, b, aLimit, bLimit) {
      const strengthA = document.getElementById('strengthA');
      const strengthB = document.getElementById('strengthB');
      const strengthAValue = document.getElementById('strengthAValue');
      const strengthBValue = document.getElementById('strengthBValue');

      const aPercent = (a / 200) * 100;
      const bPercent = (b / 200) * 100;

      strengthA.style.width = aPercent + '%';
      strengthB.style.width = bPercent + '%';
      strengthAValue.textContent = a + '/' + aLimit;
      strengthBValue.textContent = b + '/' + bLimit;
    }

    function updateConfigDisplay(config) {
      document.getElementById('threshold').textContent = config.threshold;
      document.getElementById('maxStrength').textContent = config.maxStrength;
      document.getElementById('stimDuration').textContent = config.stimDuration + '秒';
      document.getElementById('channel').textContent = config.channel;
    }

    function showQRCode(url) {
      const qrContainer = document.getElementById('qrcode');
      qrContainer.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(url) + '" alt="QR Code" />';
    }
  </script>
</body>
</html>`;
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
    statusBarItem.tooltip = '打开控制面板';
    statusBarItem.command = 'dgLabCacc.openPanel';
    statusBarItem.show();
  }
}

export function deactivate() {
  if (dgLabService) {
    dgLabService.disconnect();
  }
  if (panel) {
    panel.dispose();
  }
}

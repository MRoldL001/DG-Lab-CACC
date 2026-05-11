import * as vscode from 'vscode';
import { DGLabService, ConnectionStatus } from './dgLabService';

export class SidebarProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private dgLabService: DGLabService;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext, dgLabService: DGLabService) {
    this.context = context;
    this.dgLabService = dgLabService;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewView.webview.html = this.getHtmlContent();

    webviewView.webview.onDidReceiveMessage((message) => {
      this.handleMessage(message);
    });

    this.dgLabService.onStatusUpdate((status) => {
      this.updateStatus(status);
    });

    this.dgLabService.onStrengthUpdate((a, b, aLimit, bLimit) => {
      this.updateStrength(a, b, aLimit, bLimit);
    });

    this.updateStatus(this.dgLabService.getConnectionStatus());
  }

  private getHtmlContent(): string {
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
    <h2>🐺 DG-Lab 控制面板</h2>
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
    <h3>📱 连接设备</h3>
    <p>扫描下方二维码连接郊狼APP</p>
    <div id="qrcode" class="qrcode-container">
      <p class="hint">点击"生成二维码"按钮</p>
    </div>
    <button id="generateQR" class="btn btn-primary">生成二维码</button>
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

  <div class="section">
    <div class="info-text">
      <p>当代码评分低于阈值时，将自动触发刺激</p>
      <p>评分越低，刺激强度越高</p>
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

  private handleMessage(message: { command: string }) {
    switch (message.command) {
      case 'generateQR':
        const url = this.dgLabService.generateQRCodeUrl();
        this.view?.webview.postMessage({ command: 'showQR', url });
        break;
      case 'emergencyStop':
        this.dgLabService.emergencyStop();
        break;
      case 'disconnect':
        this.dgLabService.disconnect();
        break;
    }
  }

  public updateStatus(status: ConnectionStatus) {
    if (this.view) {
      this.view.webview.postMessage({
        command: 'updateStatus',
        status
      });
    }
  }

  public updateConfig(config: any) {
    if (this.view) {
      this.view.webview.postMessage({
        command: 'updateConfig',
        config
      });
    }
  }

  public updateStrength(a: number, b: number, aLimit: number, bLimit: number) {
    if (this.view) {
      this.view.webview.postMessage({
        command: 'updateStrength',
        a,
        b,
        aLimit,
        bLimit
      });
    }
  }
}

import * as vscode from 'vscode';

export interface DGLabConfig {
  wsServer: string;
  threshold: number;
  maxStrength: number;
  stimDuration: number;
  channel: 'A' | 'B';
}

export interface ConnectionStatus {
  isConnected: boolean;
  clientId: string;
  targetId: string;
  wsServer: string;
}

export class DGLabService {
  private ws: WebSocket | null = null;
  private clientId: string = '';
  private targetId: string = '';
  private isConnected: boolean = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private config: DGLabConfig;

  private onStatusChange?: (status: ConnectionStatus) => void;
  private onStrengthChange?: (a: number, b: number, aLimit: number, bLimit: number) => void;
  private onFeedback?: (button: number) => void;

  constructor(config: DGLabConfig) {
    this.config = config;
  }

  public setConfig(config: DGLabConfig) {
    this.config = config;
  }

  public onStatusUpdate(callback: (status: ConnectionStatus) => void) {
    this.onStatusChange = callback;
  }

  public onStrengthUpdate(callback: (a: number, b: number, aLimit: number, bLimit: number) => void) {
    this.onStrengthChange = callback;
  }

  public onFeedbackUpdate(callback: (button: number) => void) {
    this.onFeedback = callback;
  }

  public getConnectionStatus(): ConnectionStatus {
    return {
      isConnected: this.isConnected,
      clientId: this.clientId,
      targetId: this.targetId,
      wsServer: this.config.wsServer
    };
  }

  public async connect(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(this.config.wsServer);

        this.ws.onopen = () => {
          this.isConnected = true;
          this.startHeartbeat();
          this.onStatusChange?.({
            isConnected: true,
            clientId: this.clientId,
            targetId: this.targetId,
            wsServer: this.config.wsServer
          });
          resolve(true);
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.isConnected = false;
          this.onStatusChange?.({
            isConnected: false,
            clientId: this.clientId,
            targetId: this.targetId,
            wsServer: this.config.wsServer
          });
        };

        this.ws.onclose = () => {
          this.isConnected = false;
          this.stopHeartbeat();
          this.onStatusChange?.({
            isConnected: false,
            clientId: this.clientId,
            targetId: this.targetId,
            wsServer: this.config.wsServer
          });
        };

      } catch (error) {
        console.error('Failed to connect:', error);
        resolve(false);
      }
    });
  }

  public disconnect() {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.clientId = '';
    this.targetId = '';
    this.onStatusChange?.({
      isConnected: false,
      clientId: '',
      targetId: '',
      wsServer: this.config.wsServer
    });
  }

  public emergencyStop() {
    if (!this.isConnected) { return; }

    const channel = this.config.channel === 'A' ? 1 : 2;
    this.sendMessage(3, channel, 0);
  }

  public setStrength(strength: number) {
    if (!this.isConnected) { return; }

    const channel = this.config.channel === 'A' ? 1 : 2;
    const clampedStrength = Math.min(200, Math.max(0, strength));
    this.sendMessage(3, channel, clampedStrength);
  }

  public clearWaveform() {
    if (!this.isConnected) { return; }

    const channel = this.config.channel === 'A' ? 1 : 2;
    const message = `clear-${channel}`;
    this.sendRawMessage(message);
  }

  public sendWaveform(waveform: string[]) {
    if (!this.isConnected) { return; }

    const channel = this.config.channel;
    const message = `${channel}:[${waveform.map(w => `"${w}"`).join(',')}]`;
    const payload = {
      type: 'clientMsg',
      channel: channel,
      time: this.config.stimDuration,
      message: message,
      clientId: this.clientId,
      targetId: this.targetId
    };
    this.ws?.send(JSON.stringify(payload));
  }

  public generateQRCodeUrl(): string {
    const baseUrl = 'https://www.dungeon-lab.com/app-download.php#DGLAB-SOCKET#';
    return `${baseUrl}${this.config.wsServer}/${this.clientId}`;
  }

  private sendMessage(type: number, channel: number, strength: number) {
    const payload = {
      type: type,
      channel: channel,
      message: 'set channel',
      strength: strength,
      clientId: this.clientId,
      targetId: this.targetId
    };
    this.ws?.send(JSON.stringify(payload));
  }

  private sendRawMessage(message: string) {
    const payload = {
      type: 4,
      message: message,
      clientId: this.clientId,
      targetId: this.targetId
    };
    this.ws?.send(JSON.stringify(payload));
  }

  private handleMessage(data: string) {
    try {
      const msg = JSON.parse(data);

      switch (msg.type) {
        case 'bind':
          if (msg.message === 'targetId') {
            this.clientId = msg.clientId;
          } else if (msg.message === '200') {
            this.targetId = msg.targetId;
            vscode.window.showInformationMessage('DG-Lab设备连接成功！');
          } else if (msg.message === '400') {
            vscode.window.showWarningMessage('绑定失败：ID已被占用');
          } else if (msg.message === '401') {
            vscode.window.showWarningMessage('绑定失败：目标设备不存在');
          }
          this.onStatusChange?.({
            isConnected: this.isConnected,
            clientId: this.clientId,
            targetId: this.targetId,
            wsServer: this.config.wsServer
          });
          break;

        case 'msg':
          if (msg.message.startsWith('strength-')) {
            const parts = msg.message.replace('strength-', '').split('+');
            if (parts.length === 4) {
              this.onStrengthChange?.(
                parseInt(parts[0]),
                parseInt(parts[1]),
                parseInt(parts[2]),
                parseInt(parts[3])
              );
            }
          } else if (msg.message.startsWith('feedback-')) {
            const button = parseInt(msg.message.replace('feedback-', ''));
            this.onFeedback?.(button);
          }
          break;

        case 'break':
          this.targetId = '';
          vscode.window.showWarningMessage('DG-Lab设备已断开');
          this.onStatusChange?.({
            isConnected: this.isConnected,
            clientId: this.clientId,
            targetId: this.targetId,
            wsServer: this.config.wsServer
          });
          break;

        case 'heartbeat':
          break;

        case 'error':
          console.error('DGLab error:', msg.message);
          break;
      }
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  }

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected && this.ws) {
        this.ws.send(JSON.stringify({
          type: 'heartbeat',
          clientId: this.clientId,
          targetId: this.targetId,
          message: '200'
        }));
      }
    }, 60000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

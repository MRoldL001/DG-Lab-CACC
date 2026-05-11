A VSCode extension that link with DG-Lab (Coyote) devices to provide haptic feedback based on AI code quality scores.

一个VSCode扩展，连接郊狼主机（DG-Lab），根据AI代码质量评分自动触发电击反馈。

通过 [SOCKET 控制协议 V2](https://github.com/DG-LAB-OPENSOURCE/DG-LAB-OPENSOURCE/blob/main/socket/v2/README.md) 基于 [Chobits AI Code Checker](https://marketplace.visualstudio.com/items?itemName=MRoldL001.chobits-ai-code-checker) 扩展控制郊狼主机

---

## 🚀 快速开始

### 前置要求

1. 安装 [Chobits AI Code Checker](https://marketplace.visualstudio.com/items?itemName=MRoldL001.chobits-ai-code-checker) 扩展
2. 配置好AI服务（Ollama或远程API）
3. 部署郊狼WebSocket服务器（参考 [DG-LAB-OPENSOURCE](https://github.com/DG-LAB-OPENSOURCE/DG-LAB-OPENSOURCE)）

### 配置

1. 打开 VSCode 设置（`Ctrl+,`）
2. 搜索 `DG-Lab CACC`
3. 配置以下选项：

| 设置                       | 描述                       | 默认值 |
| ------------------------ | ------------------------ | --- |
| `dgLabCacc.wsServer`     | WebSocket服务器地址           | -   |
| `dgLabCacc.threshold`    | 触发阈值（分数小于阈值时触发，不包含输入的数字） | 60  |
| `dgLabCacc.maxStrength`  | 最大刺激强度（0-200）            | 100 |
| `dgLabCacc.stimDuration` | 刺激持续时间（秒）                | 5   |
| `dgLabCacc.channel`      | 刺激通道（A/B）                | A   |

### 连接设备

1. 点击左侧活动栏的🐺图标打开侧边栏
2. 点击"生成二维码"按钮
3. 打开郊狼APP → SOCKET功能 → 扫描二维码
4. 连接成功后侧边栏显示实时参数

## ⚡ 工作原理

当代码评分低于阈值时自动计算刺激强度：

```
强度 = (阈值 - 分数) / 阈值 × 最大强度
```

例如：阈值=60，最大强度=100

- 分数30分 → 强度50
- 分数0分 → 强度100
- 分数60分 → 不触发

## 🛠️ 命令面板

- `DG-Lab: 打开控制面板` - 打开侧边栏
- `DG-Lab: 紧急停止` - 立即停止所有刺激
- `DG-Lab: 断开设备` - 断开郊狼连接

## 📝 注意事项

- 确保WebSocket服务器可从郊狼APP访问
- 建议使用wss（WebSocket Secure）以确保安全

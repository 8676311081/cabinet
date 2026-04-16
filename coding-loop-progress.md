# Coding Loop Progress — Telegram Bot 修复

## Task
修复 Cabinet Telegram Bot 的交互问题：翻页、运行按钮、布局适配

## Items

### Item 1: 翻页功能修复
- Status: pending
- Problem: 点击"更多/下一页"按钮无响应
- Root cause: 需要排查 callback_query 处理链路

### Item 2: 每条任务都有运行按钮
- Status: pending  
- Problem: 只有 todo/backlog 状态才显示 ▶️，in_review/in_progress 没有
- Fix: 所有非 done/cancelled 状态都显示 ▶️

### Item 3: 点击运行后的完整流程
- Status: pending
- Problem: 点击 ▶️ 后选择 Agent → 任务启动 → 跟踪回复 全流程测试
- Fix: 确保 run → agent select → update issue → track 链路通畅

### Item 4: 端到端测试验证
- Status: pending
- Problem: 用真实 Telegram API 验证全流程
- Fix: 发送 /issues → 点击翻页 → 点击运行 → 确认收到回复

## Iteration Log

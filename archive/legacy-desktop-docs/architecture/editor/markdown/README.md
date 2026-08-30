# Markdown Editor

Markdown 使用“规范源码 + CodeMirror 增量模型 + 语义投影 + 共享 Working Copy”。文件字符串是规范内容，预览 DOM 和 Widget 都是派生物。

只有用户 `docChanged` 事务报告 `origin: local-edit`。初始化、外部 storage replacement、模式切换和 Viewer remount 不得产生 dirty 或保存。

详细分层见 [Architecture](./architecture.md)，交互见 [Live Preview UX](./live-preview-ux.md)，跨格式保存状态机见 [Document Editing and Persistence](../document-editing-persistence.md)。

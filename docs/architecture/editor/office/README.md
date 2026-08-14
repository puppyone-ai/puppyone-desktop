# Managed Office Editing

Office 只有在可逆模型、受管引擎、隔离运行环境和条件写全部可用时才标记为 editable；否则使用只读预览。

引擎负责二进制解析/导出，Working Copy 负责文档身份、版本、冲突和保存队列，Pane 只负责视图。宏和任意代码执行默认禁用；有损转换结果不得自动覆盖原文件。

保存先导出完整二进制，再基于 storageVersion 原子条件写。外部变化遵循与文本相同的 clean/conflict 原则。

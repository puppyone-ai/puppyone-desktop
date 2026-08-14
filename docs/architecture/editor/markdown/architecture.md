# Markdown Editor Architecture

## 权威链

```text
Working Copy → Markdown Model Adapter → CodeMirror EditorState.doc → 语义投影
```

Working Copy 拥有模型身份和生命周期；CodeMirror 持有高效文本结构；React 只组合视图。

## 分层

- Core：dialect、语法、源区间和序列化；
- Model Adapter：快照、替换、revision 与事务来源；
- Projection：装饰和 Widget；
- Feature：表格、代码、Mermaid、媒体、HTML、MDX；
- Platform：受控文件 URL、剪贴板、外部打开和 Worker。

storage replacement 使用专用 annotation，更新投影但不报告本地编辑。外部冲突完全由共享 Working Copy 处理，Markdown 特性不能直接保存。

热路径只增量更新；完整字符串读取限于保存快照、导出和必要恢复。

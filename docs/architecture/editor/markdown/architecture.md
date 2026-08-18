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

## 增量投影与交互坐标

`DecorationSet.map(...)` 只映射 decoration 的文档位置，不会修改已经创建的
`WidgetType` 描述对象。因此，Widget 构造时收到的 `from` / `to` 只是渲染快照，
不能作为后续用户写操作的权威坐标。

交互必须遵守以下不变量：

1. 无草稿的轻量交互（task checkbox、显示源代码、删除媒体等）在激活时通过
   `getMappedWidgetPosition` / `getMappedWidgetSourceRange` 从挂载 DOM 取得当前位置；
2. 有草稿或异步生命周期的交互（代码块、Mermaid、表格 cell）使用每个
   `EditorView` 独立拥有、随 transaction 映射的 edit session；延迟创建 session
   时，初始 range 也必须来自当前挂载 Widget，而不是构造期坐标；
3. command 在真正写入前必须针对当前 `EditorState.doc` 重新解析并验证语义 token；
4. Widget 已卸载或语义已变化时安全取消，不得回退到旧坐标；
5. 回归测试必须覆盖“在 Widget 之前编辑、Widget DOM 未重建、随后执行交互”的
   增量路径，并验证目标内容和无关正文都保持正确。

不能用每次输入后全量重建 projection 来规避坐标问题；那会破坏长文档的增量性能，
也会重新引入滚动锚点和 pane 闪烁问题。

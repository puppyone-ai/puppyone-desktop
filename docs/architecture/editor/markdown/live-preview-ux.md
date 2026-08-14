# Markdown Live Preview UX

实时预览直接编辑规范 Markdown。行内标记在光标进入相关元素时按最小范围显示；块级结构保持语义投影，通过明确命令修改。

所有交互最终形成 CodeMirror transaction，并保持选择区、IME、撤销、多光标、CJK 与 RTL 语义。投影变化、异步渲染、Live/Source 切换和视图 remount 都不产生文档 revision。

表格、Mermaid、HTML、媒体和 MDX 组件必须保留源码回退、安全边界、revision 绑定和清理函数。

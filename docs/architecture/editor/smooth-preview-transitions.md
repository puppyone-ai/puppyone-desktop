# Preview Transitions

已有内容刷新时保留上一份稳定快照；不得以 `setContent(null)` 表示 loading 并销毁可编辑 Viewer。

资源变化按路径路由，只读取匹配的打开文件。读取结果先交给 Working Copy：干净时替换模型且零写入，脏或保存中时保留双方并进入冲突。

Pane 焦点、分屏、拖动和 resize 只改变视图。Viewer 必须卸载时，Working Copy 同步捕获快照并继续存在；重新挂载从 Working Copy 初始化，初始化 revision 不产生 dirty。

必须测试：无本地编辑的任意刷新/remount 序列零写入、过时读取取消、读取失败保留旧内容、分屏重排不读取文件。

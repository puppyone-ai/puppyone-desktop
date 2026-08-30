# File Format and Viewer Pipeline

文件格式注册表集中识别语义格式。每个格式家族在自己的 Contribution 文件里声明匹配、输入要求、编辑能力和懒加载入口；内置 Contribution 清单只负责确定顺序，中央 Viewer Registry 只负责验证、组合与路由。路由层不持有文档内容或保存状态。

可编辑文本先解析进唯一 Working Copy，再附着 Viewer。只读资源通过共享资源租约获得受控能力 URL：只在匹配路径或真实批量失效时换新，并在替换或 Surface 退休时撤销。目录树刷新与打开文档刷新分开；文件事件携带路径集合，不能用全局令牌重建全部编辑器。

格式可以在自己的 Viewer 内决定渲染和模型适配细节，但不能自行决定资源身份、外部变化路由、保存时机或冲突语义。这些属于宿主协议。

外部 Viewer Pack v1 固定只读，不能获得 EditableDocumentSource 或 DocumentPersistencePort。

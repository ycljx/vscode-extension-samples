### 注意事项：

当前只适用于 Orca、OrcaPreview 和 Orca 搭建的业务应用的调试，请勿用于其他应用的调试！

### 操作步骤：

1. 点击右上角加号添加组件
2. hover 到组件上点击绑定按钮，绑定本地调试目录，将自动启动文件监听进程，请勿关闭
3. 点击右上角程序启动按钮，启动后将提示是否以跨域模式打开 Chrome，建议打开，定位到待调试的 Orca 或工作台页面
4. 通过[XSwitch](https://chrome.google.com/webstore/detail/xswitch/idkjhjggpffolpidfkikidcokdkdaogg)插件代理静态资源
5. 上述配置完成后，在绑定的本地组件目录下开发组件就会实时渲染到线上页面啦～

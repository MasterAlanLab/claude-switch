# Claude Switch 隐私说明

Claude Switch 是纯本地 Chrome 扩展，没有后端、分析、遥测、广告、远程脚本或第三方网络请求。

## 处理的数据

- 用户主动粘贴或主动捕获的 Claude `sessionKey`
- 用户填写的账号备注
- 本地创建、更新和最近使用时间
- 当前活动标签页的 URL、窗口和 Cookie store 标识，仅用于选择正确的浏览器登录环境

## 存储位置

- 普通窗口：扩展私有的 `chrome.storage.local`
- 无痕窗口：`chrome.storage.session`
- 当前激活的登录凭据：浏览器的 `claude.ai` Cookie store

扩展存储被限制为扩展可信上下文。popup 获取的账号列表不包含 `sessionKey` 字段。

## Cookie 操作

扩展只管理 `.claude.ai` 域名下名为 `sessionKey` 的 Cookie，不读取或上传 Claude 页面内容、
对话内容、密码、浏览记录或其他网站 Cookie。

## 数据删除

- 在账号菜单中点击“移除账号”可删除对应本地记录；
- 设置面板中的“清除当前 sessionKey”可移除当前浏览器环境的登录 Cookie；
- 在 Chrome 扩展管理页删除本扩展可移除扩展本地存储。

`sessionKey` 属于敏感登录凭据，请勿共享。

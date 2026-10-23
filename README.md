# 存款经营平台

结构性存款业务界面原型，支持普通产品申报、滚存系列与期次、批量导入、申报查询、复核及发行流程。

## 运行

```sh
python3 -m http.server 4287 --bind 127.0.0.1 --directory dist
```

## 校验

```sh
node --test tests/core.test.js
```

## 发布

GitHub Pages 通过仓库的自动发布流程部署 `dist/`。推送到 `main` 后先运行测试，再发布静态文件；测试文件和本说明不属于网站发布内容。

数据保存在当前浏览器，角色切换只用于交互原型；没有银行后台、真实身份认证或消息发送接口。内置记录为示例数据。本仓库不包含原始业务需求文档、工作表或个人账号配置。

Excel 读写使用本地打包的 SheetJS 0.20.3，许可文件位于 `dist/vendor/SheetJS-LICENSE.txt`。

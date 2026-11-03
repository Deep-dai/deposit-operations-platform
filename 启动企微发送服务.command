#!/bin/bash
cd "$(dirname "$0")" || exit 1
relay_node="$(command -v node)"
if [ -z "$relay_node" ]; then
  relay_node="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [ ! -x "$relay_node" ]; then
  echo "未找到运行环境，请安装 Node.js 22 或更新版本后再启动。"
  read -r -p "按回车关闭窗口"
  exit 1
fi
echo "保持此窗口开启。首次使用请在浏览器打开 http://127.0.0.1:4288/ 完成设置。"
"$relay_node" server/wecom-relay.mjs
read -r -p "发送服务已停止，按回车关闭窗口"

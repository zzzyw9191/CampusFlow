# CampusFlow 0.1-A

面向大学生的个人校园信息管理软件，目前仅完成静态页面。

## 本地开发

```sh
npm install
npm run dev
```

## 检查与构建

```sh
npm run lint
npm run build
```

## 文件说明

- `src/main.tsx`：将 React 应用挂载到页面。
- `src/App.tsx`：标题、通知输入区域和空通知列表。
- `src/App.css`：页面布局和控件样式。
- `src/index.css`：全局字体、背景和基础样式。
- `index.html`：HTML 入口和浏览器标签页标题。

输入框使用浏览器原生控件。按钮暂不绑定事件，不会添加或保存通知。

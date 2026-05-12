# 小红书投放数据分析看板

小红书广告投放数据的多维度分析看板，支持多项目切换，覆盖直播推广、商销推广、产品分析、单篇诊断和笔记总表等功能。

## 技术栈

- React 18 + TypeScript
- Vite 6
- Tailwind CSS 3
- Chart.js + react-chartjs-2（图表）
- PapaParse（CSV 解析）
- dayjs（日期处理）

## 功能模块

| 模块 | 说明 |
|------|------|
| 总览 | 总消耗/产出/ROI、日消耗趋势、营销场景占比 |
| 直播推广 | 直播投放数据、各产品/内容方向拆分 |
| 商销推广 | 商销投放数据、各产品/内容方向拆分 |
| 产品分析 | 按产品维度汇总对比 |
| 单篇诊断 | 单条笔记的投放效果诊断 |
| 笔记总表 | 全部笔记列表，支持筛选和分页 |

## 快速开始

```bash
npm install
npm run dev
```

浏览器访问 http://localhost:5173

## 构建

```bash
npm run build      # 构建产物在 dist/
npm run preview    # 预览构建结果
```

## 数据源

原始 CSV 文件放在 `public/projects/<项目id>/` 下，文件命名规则：

| 文件 | 说明 |
|------|------|
| `*_历史整体.csv` | 历史投放明细 |
| `*_实时商播.csv` | 直播推广创意数据 |
| `*_实时商笔.csv` | 商销推广创意数据 |
| `*_笔记总表.csv` | 笔记信息汇总 |
| `*_笔记标准.csv` | 笔记评级标准 |

启动开发服务器后，点击页面「更新数据」按钮会自动将原始 CSV 转码（GBK→UTF-8）并输出到 `processed/` 目录。

## 项目配置

在 `public/projects/projects.json` 中配置项目：

```json
{
  "projects": [
    {
      "id": "huagee",
      "name": "华歌尔",
      "order": 1,
      "path": "/projects/huagee/processed/",
      "rawPath": "public/projects/huagee",
      "nameParts": ["投放形式", "产品线", "产品类型", "笔记简称", "投放人群", "内容方向", "优化目标"]
    }
  ]
}
```

- `nameParts` 定义创意计划名称的字段拆分规则（按 `-` 分隔）
- 当前支持的项目：华歌尔、晓姿、小仙炖

## 目录结构

```
├── src/
│   ├── App.tsx          # 主应用组件
│   ├── main.tsx         # 入口
│   └── index.css        # 样式
├── public/
│   ├── projects/
│   │   ├── projects.json       # 项目配置
│   │   ├── huagee/             # 华歌尔原始数据
│   │   ├── xiaozi/             # 晓姿原始数据
│   │   └── xiaoxiandun/        # 小仙炖原始数据
│   └── data/                   # 旧版数据目录
├── vite.config.ts       # Vite 配置 + CSV 预处理插件
└── package.json
```

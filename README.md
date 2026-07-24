# TIA IO 映射生成器 // WEB

纯前端静态网页版 IO 映射代码生成器。浏览器中解析 PLCTags.xlsx,生成可导入 TIA V18 的 DB/FB1 源文件。无后端,文件本地处理不上传。

## 在线访问
部署到 GitHub Pages 后访问 `https://<用户名>.github.io/<仓库名>/`。

## 本地运行
任选其一:
```bash
# Python
python -m http.server 8000 --directory web
# 然后浏览器打开 http://localhost:8000

# Node
npx serve web
```

## 功能
- 解析 PLCTags.xlsx(Name/Path/Data Type/Logical Address/Comment)
- 生成 DB 源文件(.db,非优化访问 + NON_RETAIN)
- 生成 FB1 映射逻辑 SCL(.scl,逐位赋值)
- M 点(%M)映射开关 + DB 内 M点结构体(输入/输出子结构)
- 高级设置:点位选择(复选框 + M 点方向下拉框)
- POKE_BLK(块移动)模式 + DB 编号 + 不匹配警告
- 名称引号规则(全角括号合法、半角括号/空格需双引号)
- 预览生成结果
- 多文件打包下载 ZIP
- UTF-8 BOM + CRLF 编码

## 使用流程
1. 浏览器打开页面
2. 拖入 PLCTags.xlsx
3. 配置命名与选项(含 M 点/POKE_BLK/高级设置)
4. (可选)启用高级设置 → 点"选择映射点位" → 勾选 + 设 M 点方向
5. 点"生成并下载" → 得到 .db/.scl(或 ZIP)
6. TIA V18:项目树 → 外部源 → 右键 → 从文件导入 → 多选文件

## 目录结构
```
web/
├── index.html
├── css/style.css
└── js/
    ├── utils.js          数据模型 + 名称处理 + 地址解析
    ├── parser.js         SheetJS xlsx 解析
    ├── generator.js      DB/FB1/POKE_BLK 生成器
    ├── downloader.js     Blob 下载 + BOM/CRLF
    └── app.js            UI 交互 + 点位选择模态 + 缓存
```

## 技术栈
原生 HTML/CSS/JS + SheetJS + JSZip(CDN)。无构建、无后端。

## 设计
工业硬核暗色风格:纯黑/深灰底 + 霓虹橙/金属银强调 + 网格纹理 + 等宽字体高密度布局。

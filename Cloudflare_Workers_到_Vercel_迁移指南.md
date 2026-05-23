# Cloudflare Workers 到 Vercel 迁移指南

本文档旨在指导您如何将原本运行在 Cloudflare Workers 上的 DoH 转发代理代码部署到 Vercel 平台。

## 核心修改说明

为了适配 Vercel 的运行环境，我们对原始代码进行了以下关键修改：

1.  **运行环境适配**：将代码调整为 Vercel 的 **Edge Functions** 格式。
2.  **入口函数调整**：Cloudflare 使用 `export default { fetch }`，而 Vercel Edge Functions 使用 `export default async function(request)`。
3.  **环境变量访问**：在 Cloudflare 中，环境变量通过 `env` 对象传入；在 Vercel 中，通过标准的 `process.env` 访问。
4.  **路由配置**：添加了 `vercel.json` 配置文件，通过 `rewrites` 规则将所有路径的请求重定向到 `/api/doh-proxy.js` 处理。

## 部署步骤

### 1. 准备项目文件

确保您的项目目录结构如下：

```text
.
├── api/
│   └── doh-proxy.js    # 修改后的核心逻辑代码
├── vercel.json         # Vercel 配置文件
└── package.json        # (可选) 如果有依赖项
```

### 2. 部署到 Vercel

您可以选择以下任一方式进行部署：

#### 方式 A：使用 Vercel CLI (推荐)
1. 安装 Vercel CLI：`npm i -g vercel`
2. 在项目根目录运行：`vercel`
3. 按照提示完成部署。

#### 方式 B：连接 GitHub 仓库
1. 将代码推送到您的 GitHub 仓库。
2. 在 [Vercel 控制台](https://vercel.com/new) 中导入该仓库。
3. 框架预设选择 "Other"，点击部署。

### 3. 配置环境变量 (可选)

如果您需要自定义路径映射，请在 Vercel 项目设置的 **Environment Variables** 中添加以下变量：

-   **Key**: `DOMAIN_MAPPINGS`
-   **Value**: (您的 JSON 配置字符串)

示例值：
```json
{
  "/google": {
    "targetDomain": "dns.google",
    "pathMapping": {
      "/query-dns": "/dns-query"
    }
  }
}
```

## 验证部署

部署完成后，您可以访问 Vercel 分配的域名（例如 `https://your-project.vercel.app/`）来查看主页。

测试转发功能：
`https://your-project.vercel.app/google/query-dns?name=example.com`

---

*由 Manus AI 生成*

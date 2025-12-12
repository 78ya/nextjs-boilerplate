This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## URL 对等转发（透明反向代理 / IP 访问）

本项目内置一个“**透明反向代理**”模式：浏览器访问 `http://你的IP/任意路径?query` 时，服务端会转发到写死的上游 `http://182.92.3.138/任意路径?query`，并尽量做到 **路径/查询/方法/请求体/响应头/状态码 对等**。

### 启用方法

1) 参考 `env.example` 配置环境变量（部署时建议用环境变量；本地可写到 `.env.local`）。

- **PROXY_MODE**: 设为 `1` 启用透明转发
- **PROXY_REWRITE_COOKIE_DOMAIN（可选）**: 设为 `1` 时，会把上游 `Set-Cookie` 里 `Domain=<上游域名>` 尝试改成 host-only，便于通过 IP 访问时 cookie 不丢（best-effort）

2) 启动：

```bash
npm run dev
```

然后访问 `http://localhost:3000`（部署后访问你的 IP）。

### 关键实现文件

- `app/route.ts` + `app/[[...path]]/route.ts`: **从根目录 `/` 开始接管所有请求并反代**
- `app/_proxy/transparentProxy.ts`: 真正执行上游 `fetch` 并把响应透传回来（含 `Location` 改写）
- `app/api/proxy/[[...path]]/route.ts`: 兼容/调试用入口（会 strip 掉 `/api/proxy` 再转发）

### 使用 IP 的注意点（你可能需要确认）

- **HTTPS 证书**：如果你希望用户用 `https://IP` 访问，证书通常会不匹配（证书很少签发给裸 IP）。常见做法是用户用 `http://IP`，或给一个域名并配置证书。
- **Cookie/登录态**：很多站点会下发 `Set-Cookie; Domain=example.com`，当你用 IP 访问时浏览器可能不存/不带该 cookie。可以试下 `PROXY_REWRITE_COOKIE_DOMAIN=1`（但无法覆盖所有复杂 cookie 场景）。
- **重定向**：已对上游 `Location`（指回上游同源的情况）做了改写，避免跳走到上游域名。
- **WebSocket/SSE**：普通 HTTP 请求没问题；WebSocket 反代需要额外支持（本实现未覆盖 WS upgrade）。
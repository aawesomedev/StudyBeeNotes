import { createServer } from "node:http";
import { fileURLToPath } from "url";
import { hostname } from "node:os";
import { dirname, join } from "path";
import { createRequire } from "module";
import { readFile, writeFile } from "node:fs/promises";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import { sendDiscordEmbed } from "./sendembed.js";

const require = createRequire(import.meta.url);

const scramjetDistPath = join(
  dirname(require.resolve("@mercuryworkshop/scramjet/package.json")),
  "dist"
);

import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const publicPath = fileURLToPath(new URL("../public/", import.meta.url));
const searchPath = join(publicPath, "s");

const staticPages = [
  "index",
  "about",
  "login",
  "pricing"
];

const accountsPath = fileURLToPath(new URL("../accounts.json", import.meta.url));

async function readAccounts() {
  try {
    return JSON.parse(await readFile(accountsPath, "utf8"));
  } catch {
    return {};
  }
}

async function writeAccounts(accounts) {
  await writeFile(accountsPath, JSON.stringify(accounts, null, 2));
}

// Wisp Configuration: Refer to the documentation at https://www.npmjs.com/package/@mercuryworkshop/wisp-js

logging.set_level(logging.NONE);
Object.assign(wisp.options, {
  allow_udp_streams: false,
  hostname_blacklist: [/example\.com/],
  dns_servers: ["1.1.1.3", "1.0.0.3"]
});

const fastify = Fastify({
	serverFactory: (handler) => {
		return createServer()
			.on("request", (req, res) => {
				res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
				res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
				handler(req, res);
			})
			.on("upgrade", (req, socket, head) => {
				if (req.url.endsWith("/wisp/")) wisp.routeRequest(req, socket, head);
				else socket.end();
			});
	},
});

fastify.register(fastifyCookie);

fastify.register(fastifyStatic, {
        root: publicPath,
        decorateReply: true,
});

fastify.register(fastifyStatic, {
  root: searchPath,
  prefix: "/s/",
  decorateReply: false,
});

fastify.get("/s", (req, reply) => {
  return reply.sendFile("index.html", { root: searchPath });
});

fastify.register(fastifyStatic, {
  root: scramjetDistPath,
  prefix: "/scram/",
  decorateReply: false,
});

fastify.register(fastifyStatic, {
	root: epoxyPath,
	prefix: "/epoxy/",
	decorateReply: false,
});

fastify.register(fastifyStatic, {
        root: baremuxPath,
        prefix: "/baremux/",
        decorateReply: false,
});

fastify.post("/attempt-login", async (req, reply) => {
  const { key, code } = req.body || {};
  if (!key || !code) {
    return { success: false };
  }

  const accounts = await readAccounts();
  const account = accounts[key];

  if (!account || account.pin !== code || account.locked) {
    return { success: false };
  }

  const ip = req.ip;
  if (!account.ip) {
    account.ip = ip;
    await writeAccounts(accounts);
	sendDiscordEmbed("https://discord.com/api/webhooks/1410146055948992562/bz-t3I-hYZbQ-a19SAuws68ZbQr2PfG7nBH-vGTuxYpb4Ugcr1u9oZoQ2M746zkfpJuV", {
		title: "🟢 Account IP Stored",
		description: `${key} is now registered to ip ${ip}`,
		color: 0x00ff00 
	});
  } else if (account.ip !== ip) {
    account.locked = true;
	sendDiscordEmbed("https://discord.com/api/webhooks/1410146055948992562/bz-t3I-hYZbQ-a19SAuws68ZbQr2PfG7nBH-vGTuxYpb4Ugcr1u9oZoQ2M746zkfpJuV", {
		title: "⚠️ Account Locked",
		description: `${key} was permanently locked due to IP mismatch. IP on file: ${account.ip}, IP request: ${ip}`,
		color: 0xff0000 
	});
    await writeAccounts(accounts);
    return { success: false };
  }

  reply.setCookie("session", key, { path: "/", httpOnly: true });
  return { success: true };
});

fastify.get("/auth", async (req, reply) => {
  const accounts = await readAccounts();
  const key = req.cookies.session;
  if (!key) {
    return { authenticated: false };
  }

  const account = accounts[key];
  if (!account || account.locked || account.ip !== req.ip) {
    return { authenticated: false };
  }
  return { authenticated: true };
});

staticPages.forEach((page) => {
  const routePath = page === "index" ? "/" : `/${page}`;
  fastify.get(routePath, (req, reply) => {
    return reply.sendFile(`${page}.html`);
  });
});

fastify.setNotFoundHandler((res, reply) => {
        return reply.code(404).type('text/html').sendFile('404.html');
})

fastify.server.on("listening", () => {
	const address = fastify.server.address();

	// by default we are listening on 0.0.0.0 (every interface)
	// we just need to list a few
	console.log("Listening on:");
	console.log(`\thttp://localhost:${address.port}`);
	console.log(`\thttp://${hostname()}:${address.port}`);
	console.log(
		`\thttp://${
			address.family === "IPv6" ? `[${address.address}]` : address.address
		}:${address.port}`
	);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
	console.log("SIGTERM signal received: closing HTTP server");
	fastify.close();
	process.exit(0);
}

let port = parseInt(process.env.PORT || "");

if (isNaN(port)) port = 8080;

fastify.listen({
	port: port,
	host: "0.0.0.0",
});

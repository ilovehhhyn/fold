// Serves the built `dist` folder under a nested path, so browser tests prove that the build works from a sub-path.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const port = 4317;
const mountPath = "/nested/site/";
const distDirectory = fileURLToPath(new URL("../../dist/", import.meta.url));
const contentTypes = new Map([
	[".css", "text/css; charset=utf-8"],
	[".html", "text/html; charset=utf-8"],
	[".js", "text/javascript; charset=utf-8"],
	[".woff2", "font/woff2"],
]);

const server = createServer(async (request, response) => {
	const { pathname } = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
	if (!pathname.startsWith(mountPath)) {
		response.writeHead(404).end("not under the mount path");
		return;
	}
	const relativePath = decodeURIComponent(pathname.slice(mountPath.length)) || "index.html";
	const filePath = normalize(join(distDirectory, relativePath));
	if (!filePath.startsWith(distDirectory) || filePath.includes(`${sep}..${sep}`)) {
		response.writeHead(403).end("path leaves the dist folder");
		return;
	}
	try {
		const body = await readFile(filePath);
		const contentType = contentTypes.get(extname(filePath));
		if (contentType === undefined) {
			response.writeHead(415).end(`no content type is registered for ${extname(filePath)}`);
			return;
		}
		response.writeHead(200, { "content-type": contentType }).end(body);
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			response.writeHead(404).end("no such file");
			return;
		}
		throw error;
	}
});

server.listen(port, "127.0.0.1");

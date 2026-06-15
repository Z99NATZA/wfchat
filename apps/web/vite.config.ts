import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

const markdownChunkPackages = [
	"react-markdown",
	"remark-gfm",
	"remark-parse",
	"remark-rehype",
	"unified",
	"vfile",
	"micromark",
	"mdast-util",
	"hast-util",
	"hastscript",
	"property-information",
	"space-separated-tokens",
	"comma-separated-tokens",
	"trim-lines",
	"unist-util",
	"bail",
	"decode-named-character-reference",
	"devlop",
	"html-url-attributes",
	"is-plain-obj",
	"trough",
	"zwitch",
	"ccount",
	"character-entities",
	"markdown-table",
	"stringify-entities"
];

function isMarkdownRendererPackage(id: string) {
	const normalizedId = id.replaceAll("\\", "/");

	return markdownChunkPackages.some((packageName) =>
		normalizedId.includes(`/node_modules/${packageName}/`)
	);
}

export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			"@": path.resolve(currentDir, "src")
		}
	},
	build: {
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (isMarkdownRendererPackage(id)) {
						return "markdown-renderer";
					}
				}
			}
		}
	},
	server: {
		host: "0.0.0.0",
		port: 5173
	}
});

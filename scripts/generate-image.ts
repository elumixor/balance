#!/usr/bin/env bun
// Generates an image via Vercel AI Gateway and saves it to disk.
// Usage: bun scripts/generate-image.ts "<prompt>" [outputPath] [model] [aspectRatio]
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { generateImage } from "ai";

const DEFAULT_MODEL = "google/imagen-4.0-ultra-generate-001";

async function main() {
    const [prompt, outputArg, model = DEFAULT_MODEL, aspectRatio = "1:1"] = process.argv.slice(2);

    if (!prompt) {
        console.error('Usage: bun scripts/generate-image.ts "<prompt>" [outputPath] [model] [aspectRatio]');
        process.exit(1);
    }

    if (!process.env.AI_GATEWAY_API_KEY) throw new Error("AI_GATEWAY_API_KEY not set");

    const outputPath = resolve(outputArg ?? `output/generated-${Date.now()}.png`);
    await mkdir(dirname(outputPath), { recursive: true });

    const result = await generateImage({ model, prompt, aspectRatio });
    const image = result.images[0];
    if (!image) throw new Error("No image returned");

    await Bun.write(outputPath, Buffer.from(image.base64, "base64"));
    console.log(outputPath);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

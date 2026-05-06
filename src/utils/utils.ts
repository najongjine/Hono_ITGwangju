import path from "path";
import sharp from "sharp";

export interface WebpImageResult {
  buffer: Buffer;
  mimeType: "image/webp";
  size: number;
  storedName: string;
}

export const isImageMimeType = (mimeType: string) =>
  mimeType.toLowerCase().startsWith("image/");

export const isWebpImage = (fileName: string, mimeType = "") =>
  mimeType.toLowerCase() === "image/webp" ||
  path.extname(fileName).toLowerCase() === ".webp";

export const toWebpFileName = (fileName: string) => {
  const parsed = path.parse(fileName);
  const name = parsed.name || "image";

  return `${name}.webp`;
};

export const convertImageToWebp = async (
  input: Buffer,
  fileName: string,
  mimeType = "",
  quality = 82
): Promise<WebpImageResult> => {
  if (isWebpImage(fileName, mimeType)) {
    return {
      buffer: input,
      mimeType: "image/webp",
      size: input.length,
      storedName: toWebpFileName(fileName),
    };
  }

  const buffer = await sharp(input)
    .rotate()
    .webp({
      quality,
      effort: 4,
    })
    .toBuffer();

  return {
    buffer,
    mimeType: "image/webp",
    size: buffer.length,
    storedName: toWebpFileName(fileName),
  };
};

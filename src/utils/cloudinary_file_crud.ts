import path from "path";
import { v2 as cloudinary, type UploadApiOptions } from "cloudinary";
import * as dotenv from "dotenv";

const envFile =
  process.env.ENV_FILE ??
  (process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development");
dotenv.config({ path: envFile });

const getCloudinaryEnv = () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const missing = [
    ["CLOUDINARY_CLOUD_NAME", cloudName],
    ["CLOUDINARY_API_KEY", apiKey],
    ["CLOUDINARY_API_SECRET", apiSecret],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing Cloudinary env: ${missing.join(", ")}`);
  }

  return {
    cloudName: cloudName as string,
    apiKey: apiKey as string,
    apiSecret: apiSecret as string,
  };
};

const configureCloudinary = () => {
  const env = getCloudinaryEnv();
  cloudinary.config({
    cloud_name: env.cloudName,
    api_key: env.apiKey,
    api_secret: env.apiSecret,
    secure: true,
  });
  return env;
};

export const getCloudinaryCloudName = () => getCloudinaryEnv().cloudName;

export const normalizeCloudinaryKey = (key: string) =>
  key
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)
    .join("/");

const withoutExtension = (key: string) => {
  const ext = path.posix.extname(key);
  return ext ? key.slice(0, -ext.length) : key;
};

export interface CloudinaryUploadParams {
  key: string;
  body: Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface CloudinaryFileInfo {
  key: string;
  url: string;
  size: number;
  contentType: string;
  format: string;
  resourceType: string;
  createdAt?: string;
}

export const uploadCloudinaryFile = async ({
  key,
  body,
  contentType = "application/octet-stream",
}: CloudinaryUploadParams): Promise<CloudinaryFileInfo> => {
  configureCloudinary();
  const normalizedKey = normalizeCloudinaryKey(key);
  const isImage = contentType.toLowerCase().startsWith("image/");
  const publicId = isImage ? withoutExtension(normalizedKey) : normalizedKey;
  const options: UploadApiOptions = {
    public_id: publicId,
    resource_type: isImage ? "image" : "raw",
    overwrite: true,
    invalidate: true,
  };

  const result = await new Promise<any>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, value) => {
      if (error || !value) {
        reject(error ?? new Error("Cloudinary upload returned no result"));
        return;
      }
      resolve(value);
    });
    stream.end(body);
  });

  return {
    key: result.public_id,
    url: result.secure_url,
    size: result.bytes,
    contentType,
    format: result.format ?? path.extname(normalizedKey).replace(/^\./, ""),
    resourceType: result.resource_type,
    createdAt: result.created_at,
  };
};

export const deleteCloudinaryFile = async (
  key: string,
  resourceType: "image" | "raw" = "image"
) => {
  configureCloudinary();
  const normalizedKey = normalizeCloudinaryKey(key);
  const result = await cloudinary.uploader.destroy(normalizedKey, {
    resource_type: resourceType,
    invalidate: true,
  });
  return { key: normalizedKey, result: result.result };
};

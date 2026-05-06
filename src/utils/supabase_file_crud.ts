import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import * as dotenv from "dotenv";

const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development";
dotenv.config({ path: envFile });

type FileBody = NonNullable<PutObjectCommandInput["Body"]>;

export interface UploadFileParams {
  key: string;
  body: FileBody;
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

export interface StorageFileInfo {
  key: string;
  size?: number;
  contentType?: string;
  eTag?: string;
  lastModified?: Date;
  metadata?: Record<string, string>;
}

export interface ListedStorageFile extends StorageFileInfo {
  storageClass?: string;
}

export interface DownloadedStorageFile extends StorageFileInfo {
  body: Buffer;
}

export interface UploadedFileWithSignedUrl {
  file: StorageFileInfo;
  signedUrl: string;
  expiresIn: number;
}

let storageClient: S3Client | null = null;

const getStorageEnv = () => {
  const endpoint = process.env.STORAGE_ENDPOINT ?? process.env.STORAGE_Endpoint;
  const accessKeyId =
    process.env.STORAGE_KEY_ID ?? process.env.STORAGE_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.STORAGE_ACCESS_KEY ?? process.env.STORAGE_SECRET_ACCESS_KEY;
  const bucket = process.env.STORAGE_BUCKET ?? process.env.STORAGE_Bucket;

  const missing = [
    ["STORAGE_ENDPOINT", endpoint],
    ["STORAGE_KEY_ID", accessKeyId],
    ["STORAGE_ACCESS_KEY", secretAccessKey],
    ["STORAGE_BUCKET", bucket],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing Supabase storage env: ${missing.join(", ")}`);
  }

  return {
    endpoint: endpoint as string,
    accessKeyId: accessKeyId as string,
    secretAccessKey: secretAccessKey as string,
    bucket: bucket as string,
    region: process.env.STORAGE_REGION ?? "auto",
  };
};

export const getSupabaseStorageClient = () => {
  if (storageClient) {
    return storageClient;
  }

  const { endpoint, accessKeyId, secretAccessKey, region } = getStorageEnv();
  storageClient = new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return storageClient;
};

export const getStorageBucket = () => getStorageEnv().bucket;

export const normalizeStorageKey = (key: string) =>
  key
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .join("/");

const encodeStorageKey = (key: string) =>
  normalizeStorageKey(key)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

const toStorageInfo = (key: string, file: Partial<StorageFileInfo>) => ({
  key: normalizeStorageKey(key),
  size: file.size,
  contentType: file.contentType,
  eTag: file.eTag,
  lastModified: file.lastModified,
  metadata: file.metadata,
});

export const uploadFile = async ({
  key,
  body,
  contentType,
  cacheControl = "3600",
  metadata,
}: UploadFileParams): Promise<StorageFileInfo> => {
  const normalizedKey = normalizeStorageKey(key);
  const client = getSupabaseStorageClient();
  const bucket = getStorageBucket();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: normalizedKey,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
      Metadata: metadata,
    })
  );

  return getFileInfo(normalizedKey);
};

export const updateFile = uploadFile;

export const uploadFileAndCreateSignedUrl = async (
  params: UploadFileParams,
  expiresIn = 60 * 10
): Promise<UploadedFileWithSignedUrl> => {
  const file = await uploadFile(params);
  const signedUrl = await createSignedDownloadUrl(file.key, expiresIn);

  return {
    file,
    signedUrl,
    expiresIn,
  };
};

export const downloadFile = async (
  key: string
): Promise<DownloadedStorageFile> => {
  const normalizedKey = normalizeStorageKey(key);
  const client = getSupabaseStorageClient();
  const bucket = getStorageBucket();

  const result = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: normalizedKey,
    })
  );

  const bytes = await result.Body?.transformToByteArray();
  if (!bytes) {
    throw new Error(`Storage file has no body: ${normalizedKey}`);
  }

  return {
    ...toStorageInfo(normalizedKey, {
      size: result.ContentLength,
      contentType: result.ContentType,
      eTag: result.ETag,
      lastModified: result.LastModified,
      metadata: result.Metadata,
    }),
    body: Buffer.from(bytes),
  };
};

export const getFileInfo = async (key: string): Promise<StorageFileInfo> => {
  const normalizedKey = normalizeStorageKey(key);
  const client = getSupabaseStorageClient();
  const bucket = getStorageBucket();

  const result = await client.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: normalizedKey,
    })
  );

  return toStorageInfo(normalizedKey, {
    size: result.ContentLength,
    contentType: result.ContentType,
    eTag: result.ETag,
    lastModified: result.LastModified,
    metadata: result.Metadata,
  });
};

export const listFiles = async (
  prefix = "",
  maxKeys = 100
): Promise<ListedStorageFile[]> => {
  const client = getSupabaseStorageClient();
  const bucket = getStorageBucket();

  const result = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: normalizeStorageKey(prefix),
      MaxKeys: maxKeys,
    })
  );

  return (result.Contents ?? []).map((file) => ({
    key: file.Key ?? "",
    size: file.Size,
    eTag: file.ETag,
    lastModified: file.LastModified,
    storageClass: file.StorageClass,
  }));
};

export const deleteFile = async (key: string) => {
  const normalizedKey = normalizeStorageKey(key);
  const client = getSupabaseStorageClient();
  const bucket = getStorageBucket();

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: normalizedKey,
    })
  );

  return { key: normalizedKey };
};

export const deleteFiles = async (keys: string[]) => {
  const normalizedKeys = keys.map(normalizeStorageKey).filter(Boolean);
  if (normalizedKeys.length === 0) {
    return [];
  }

  const client = getSupabaseStorageClient();
  const bucket = getStorageBucket();

  const result = await client.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: normalizedKeys.map((key) => ({ Key: key })),
        Quiet: false,
      },
    })
  );

  if (result.Errors && result.Errors.length > 0) {
    const messages = result.Errors.map(
      (error) => `${error.Key}: ${error.Message ?? error.Code ?? "delete error"}`
    );
    throw new Error(`Failed to delete storage files. ${messages.join(", ")}`);
  }

  return normalizedKeys.map((key) => ({ key }));
};

export const copyFile = async (
  sourceKey: string,
  destinationKey: string
): Promise<StorageFileInfo> => {
  const source = normalizeStorageKey(sourceKey);
  const destination = normalizeStorageKey(destinationKey);
  const client = getSupabaseStorageClient();
  const bucket = getStorageBucket();

  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${encodeStorageKey(source)}`,
      Key: destination,
    })
  );

  return getFileInfo(destination);
};

export const moveFile = async (
  sourceKey: string,
  destinationKey: string
): Promise<StorageFileInfo> => {
  const copiedFile = await copyFile(sourceKey, destinationKey);
  await deleteFile(sourceKey);
  return copiedFile;
};

export const getPublicUrl = (key: string) => {
  const { endpoint, bucket } = getStorageEnv();
  const projectStorageUrl = endpoint.replace(/\/storage\/v1\/s3\/?$/, "");

  return `${projectStorageUrl}/storage/v1/object/public/${encodeURIComponent(
    bucket
  )}/${encodeStorageKey(key)}`;
};

export const createSignedDownloadUrl = async (
  key: string,
  expiresIn = 60 * 5
) => {
  const normalizedKey = normalizeStorageKey(key);
  const client = getSupabaseStorageClient();
  const bucket = getStorageBucket();

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: normalizedKey,
    }),
    { expiresIn }
  );
};

export const createSignedUploadUrl = async (
  key: string,
  expiresIn = 60 * 5,
  contentType?: string
) => {
  const normalizedKey = normalizeStorageKey(key);
  const client = getSupabaseStorageClient();
  const bucket = getStorageBucket();

  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: normalizedKey,
      ContentType: contentType,
    }),
    { expiresIn }
  );
};

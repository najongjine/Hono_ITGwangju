import {
  copyFile as fsCopyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

export interface LocalFileInfo {
  key: string;
  path: string;
  size: number;
  contentType: string;
  lastModified: Date;
}

export interface UploadedLocalFile extends LocalFileInfo {
  originalName: string;
  storedName: string;
}

const contentTypes: Record<string, string> = {
  ".avif": "image/avif",
  ".css": "text/css",
  ".csv": "text/csv",
  ".gif": "image/gif",
  ".html": "text/html",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript",
  ".json": "application/json",
  ".md": "text/markdown",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".webp": "image/webp",
  ".xml": "application/xml",
  ".zip": "application/zip",
};

export const getLocalUploadRoot = () =>
  path.resolve(process.env.LOCAL_FILE_LOC ?? process.env.LOCAL_UPLOAD_DIR ?? "uploads");

export const normalizeLocalKey = (key: string) =>
  key
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .join("/");

const assertInsideRoot = (absolutePath: string) => {
  const root = getLocalUploadRoot();
  const relative = path.relative(root, absolutePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("File path must stay inside the local upload directory");
  }
};

export const resolveLocalPath = (key: string) => {
  const normalizedKey = normalizeLocalKey(key);
  if (!normalizedKey) {
    throw new Error("key is required");
  }

  const absolutePath = path.resolve(getLocalUploadRoot(), normalizedKey);
  assertInsideRoot(absolutePath);

  return {
    key: normalizedKey,
    path: absolutePath,
  };
};

export const makeLocalFileKey = (dir: string, fileName: string) => {
  const safeDir = normalizeLocalKey(dir);
  const ext = path.extname(fileName);
  const storedName = `${uuidv4()}${ext}`;

  return {
    key: safeDir ? `${safeDir}/${storedName}` : storedName,
    storedName,
  };
};

export const getContentType = (fileName: string, fallback = "") =>
  fallback ||
  contentTypes[path.extname(fileName).toLowerCase()] ||
  "application/octet-stream";

const toLocalFileInfo = async (key: string): Promise<LocalFileInfo> => {
  const resolved = resolveLocalPath(key);
  const fileStat = await stat(resolved.path);

  if (!fileStat.isFile()) {
    throw new Error(`Not a file: ${resolved.key}`);
  }

  return {
    key: resolved.key,
    path: resolved.path,
    size: fileStat.size,
    contentType: getContentType(resolved.key),
    lastModified: fileStat.mtime,
  };
};

export const ensureLocalUploadRoot = async () => {
  await mkdir(getLocalUploadRoot(), { recursive: true });
};

export const listLocalFiles = async (prefix = "") => {
  await ensureLocalUploadRoot();

  const normalizedPrefix = normalizeLocalKey(prefix);
  const startPath = normalizedPrefix
    ? resolveLocalPath(normalizedPrefix).path
    : getLocalUploadRoot();
  const files: LocalFileInfo[] = [];

  const walk = async (dirPath: string) => {
    let entries;
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch (error: any) {
      if (error?.code === "ENOENT") {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      assertInsideRoot(entryPath);

      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const key = normalizeLocalKey(
        path.relative(getLocalUploadRoot(), entryPath)
      );
      files.push(await toLocalFileInfo(key));
    }
  };

  try {
    const startStat = await stat(startPath);
    if (startStat.isFile()) {
      return [await toLocalFileInfo(normalizedPrefix)];
    }

    await walk(startPath);
    return files;
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
};

export const getLocalFileInfo = toLocalFileInfo;

export const readLocalFile = async (key: string) => {
  const file = await getLocalFileInfo(key);

  return {
    ...file,
    body: await readFile(file.path),
  };
};

export const uploadLocalFile = async ({
  dir = "uploads",
  originalName,
  body,
  contentType,
  storedName,
}: {
  dir?: string;
  originalName: string;
  body: Buffer;
  contentType?: string;
  storedName?: string;
}): Promise<UploadedLocalFile> => {
  await ensureLocalUploadRoot();

  const fileKey = makeLocalFileKey(dir, storedName ?? originalName);
  const resolved = resolveLocalPath(fileKey.key);

  await mkdir(path.dirname(resolved.path), { recursive: true });
  await writeFile(resolved.path, body);

  const file = await getLocalFileInfo(resolved.key);

  return {
    ...file,
    contentType: getContentType(file.key, contentType),
    originalName,
    storedName: fileKey.storedName,
  };
};

export const replaceLocalFile = async ({
  key,
  originalName,
  body,
  contentType,
}: {
  key: string;
  originalName: string;
  body: Buffer;
  contentType?: string;
}) => {
  await ensureLocalUploadRoot();

  const resolved = resolveLocalPath(key);
  await mkdir(path.dirname(resolved.path), { recursive: true });
  await writeFile(resolved.path, body);

  const file = await getLocalFileInfo(resolved.key);

  return {
    ...file,
    contentType: getContentType(file.key, contentType),
    originalName,
    storedName: path.basename(resolved.key),
  };
};

export const deleteLocalFile = async (key: string) => {
  const resolved = resolveLocalPath(key);
  await rm(resolved.path, { force: false });

  return { key: resolved.key };
};

export const copyLocalFile = async (
  sourceKey: string,
  destinationKey: string
) => {
  const source = resolveLocalPath(sourceKey);
  const destination = resolveLocalPath(destinationKey);

  await mkdir(path.dirname(destination.path), { recursive: true });
  await fsCopyFile(source.path, destination.path);

  return getLocalFileInfo(destination.key);
};

export const moveLocalFile = async (
  sourceKey: string,
  destinationKey: string
) => {
  const source = resolveLocalPath(sourceKey);
  const destination = resolveLocalPath(destinationKey);

  await mkdir(path.dirname(destination.path), { recursive: true });
  await rename(source.path, destination.path);

  return getLocalFileInfo(destination.key);
};

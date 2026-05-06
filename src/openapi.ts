export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Hono ITGwangju API",
    version: "1.0.0",
    description:
      "Local file and private Supabase Storage CRUD API. Image uploads are converted to WebP before storage.",
  },
  servers: [
    {
      url: "http://localhost:7860",
      description: "Local development server",
    },
  ],
  tags: [
    {
      name: "Local Files",
      description: "Local computer file CRUD with database metadata",
    },
    {
      name: "Supabase Storage",
      description: "Private bucket file CRUD with signed URLs",
    },
  ],
  paths: {
    "/api/file/files": {
      get: {
        tags: ["Local Files"],
        summary: "List local files",
        parameters: [
          {
            name: "prefix",
            in: "query",
            required: false,
            schema: { type: "string", example: "uploads" },
          },
        ],
        responses: {
          "200": {
            description: "Files under the local upload directory",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LocalListFilesResponse" },
              },
            },
          },
        },
      },
      post: {
        tags: ["Local Files"],
        summary: "Upload local files",
        description:
          "Uploads one or more files to the local upload directory. Image files are converted to WebP and metadata is inserted into t_files.",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["files"],
                properties: {
                  files: {
                    type: "array",
                    items: { type: "string", format: "binary" },
                  },
                  dir: {
                    type: "string",
                    default: "uploads",
                    example: "images",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Uploaded local files with DB metadata",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LocalUploadFilesResponse" },
              },
            },
          },
        },
      },
      put: {
        tags: ["Local Files"],
        summary: "Replace a local file",
        description:
          "Replaces a local file by key and upserts its t_files metadata. Image files are converted to WebP.",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["key", "file"],
                properties: {
                  key: {
                    type: "string",
                    example: "images/example.webp",
                  },
                  file: { type: "string", format: "binary" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated local file with DB metadata",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LocalSingleFileResponse" },
              },
            },
          },
        },
      },
      delete: {
        tags: ["Local Files"],
        summary: "Delete a local file",
        parameters: [
          {
            name: "key",
            in: "query",
            required: true,
            schema: { type: "string", example: "images/example.webp" },
          },
        ],
        responses: {
          "200": {
            description: "Deleted local file key",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DeleteFileResponse" },
              },
            },
          },
        },
      },
    },
    "/api/file/files/info": {
      get: {
        tags: ["Local Files"],
        summary: "Get local file metadata",
        parameters: [
          {
            name: "key",
            in: "query",
            required: true,
            schema: { type: "string", example: "images/example.webp" },
          },
        ],
        responses: {
          "200": {
            description: "Local file metadata with DB row",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LocalSingleFileResponse" },
              },
            },
          },
        },
      },
    },
    "/api/file/files/download": {
      get: {
        tags: ["Local Files"],
        summary: "Download or preview a local file",
        parameters: [
          {
            name: "key",
            in: "query",
            required: true,
            schema: { type: "string", example: "images/example.webp" },
          },
        ],
        responses: {
          "200": {
            description: "Local file stream",
            content: {
              "application/octet-stream": {
                schema: { type: "string", format: "binary" },
              },
            },
          },
        },
      },
    },
    "/api/file/files/copy": {
      post: {
        tags: ["Local Files"],
        summary: "Copy a local file",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CopyMoveRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Copied local file with DB metadata",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LocalSingleFileResponse" },
              },
            },
          },
        },
      },
    },
    "/api/file/files/move": {
      post: {
        tags: ["Local Files"],
        summary: "Move a local file",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CopyMoveRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Moved local file with DB metadata",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LocalSingleFileResponse" },
              },
            },
          },
        },
      },
    },
    "/api/file/root": {
      get: {
        tags: ["Local Files"],
        summary: "Get local upload root",
        responses: {
          "200": {
            description: "Resolved local upload root",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiResponse" },
              },
            },
          },
        },
      },
    },
    "/api/supabase-test/files": {
      get: {
        tags: ["Supabase Storage"],
        summary: "List files",
        parameters: [
          {
            name: "prefix",
            in: "query",
            required: false,
            schema: { type: "string", example: "images" },
          },
          {
            name: "maxKeys",
            in: "query",
            required: false,
            schema: { type: "integer", default: 100, minimum: 1 },
          },
        ],
        responses: {
          "200": {
            description: "Files in the storage bucket",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ListFilesResponse" },
              },
            },
          },
        },
      },
      post: {
        tags: ["Supabase Storage"],
        summary: "Upload files",
        description:
          "Uploads one or more files. Image files are converted to WebP and the response includes a signed read URL.",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["files"],
                properties: {
                  files: {
                    type: "array",
                    items: {
                      type: "string",
                      format: "binary",
                    },
                  },
                  dir: {
                    type: "string",
                    default: "uploads",
                    example: "images",
                  },
                  expiresIn: {
                    type: "integer",
                    default: 600,
                    description: "Signed URL lifetime in seconds",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Uploaded files with signed URLs",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UploadFilesResponse" },
              },
            },
          },
        },
      },
      put: {
        tags: ["Supabase Storage"],
        summary: "Replace a file",
        description:
          "Replaces a file at a specific key. Image files are converted to WebP before upload.",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["key", "file"],
                properties: {
                  key: {
                    type: "string",
                    example: "images/example.webp",
                  },
                  file: {
                    type: "string",
                    format: "binary",
                  },
                  expiresIn: {
                    type: "integer",
                    default: 600,
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated file with signed URL",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SingleUploadResponse" },
              },
            },
          },
        },
      },
      delete: {
        tags: ["Supabase Storage"],
        summary: "Delete a file",
        parameters: [
          {
            name: "key",
            in: "query",
            required: true,
            schema: { type: "string", example: "images/example.webp" },
          },
        ],
        responses: {
          "200": {
            description: "Deleted key",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DeleteFileResponse" },
              },
            },
          },
        },
      },
    },
    "/api/supabase-test/files/info": {
      get: {
        tags: ["Supabase Storage"],
        summary: "Get file metadata and signed read URL",
        parameters: [
          {
            name: "key",
            in: "query",
            required: true,
            schema: { type: "string", example: "images/example.webp" },
          },
          {
            name: "expiresIn",
            in: "query",
            required: false,
            schema: { type: "integer", default: 600 },
          },
        ],
        responses: {
          "200": {
            description: "File metadata with signed URL",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/FileInfoResponse" },
              },
            },
          },
        },
      },
    },
    "/api/supabase-test/files/read-url": {
      get: {
        tags: ["Supabase Storage"],
        summary: "Create signed read URL",
        parameters: [
          {
            name: "key",
            in: "query",
            required: true,
            schema: { type: "string", example: "images/example.webp" },
          },
          {
            name: "expiresIn",
            in: "query",
            required: false,
            schema: { type: "integer", default: 600 },
          },
        ],
        responses: {
          "200": {
            description: "Signed read URL",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SignedUrlResponse" },
              },
            },
          },
        },
      },
    },
    "/api/supabase-test/files/signed-upload-url": {
      post: {
        tags: ["Supabase Storage"],
        summary: "Create signed upload URL for non-image files",
        description:
          "Image content types are rejected here because image uploads must pass through the server WebP conversion step.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["key"],
                properties: {
                  key: {
                    type: "string",
                    example: "documents/example.pdf",
                  },
                  contentType: {
                    type: "string",
                    example: "application/pdf",
                  },
                  expiresIn: {
                    type: "integer",
                    default: 600,
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Signed upload URL",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SignedUrlResponse" },
              },
            },
          },
        },
      },
    },
    "/api/supabase-test/files/copy": {
      post: {
        tags: ["Supabase Storage"],
        summary: "Copy a file",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CopyMoveRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Copied file metadata with signed URL",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/FileInfoResponse" },
              },
            },
          },
        },
      },
    },
    "/api/supabase-test/files/move": {
      post: {
        tags: ["Supabase Storage"],
        summary: "Move a file",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CopyMoveRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Moved file metadata with signed URL",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/FileInfoResponse" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    responses: {
      Error: {
        description: "API error",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiResponse" },
          },
        },
      },
    },
    schemas: {
      ApiResponse: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          data: { nullable: true },
          code: { type: "string" },
          message: { type: "string" },
        },
        required: ["success", "data", "code", "message"],
      },
      StorageFile: {
        type: "object",
        properties: {
          key: { type: "string", example: "images/example.webp" },
          size: { type: "integer", nullable: true },
          contentType: { type: "string", nullable: true, example: "image/webp" },
          eTag: { type: "string", nullable: true },
          lastModified: {
            type: "string",
            format: "date-time",
            nullable: true,
          },
          metadata: {
            type: "object",
            additionalProperties: { type: "string" },
            nullable: true,
          },
        },
      },
      LocalFile: {
        type: "object",
        properties: {
          id: { type: "integer", nullable: true },
          key: { type: "string", example: "images/example.webp" },
          path: {
            type: "string",
            example: "D:/Hono/Hono_ITGwangju/uploads/images/example.webp",
          },
          url: {
            type: "string",
            example: "/api/file/files/download?key=images%2Fexample.webp",
          },
          originalName: { type: "string", nullable: true, example: "sample.png" },
          storedName: { type: "string", nullable: true, example: "sample.webp" },
          size: { type: "integer", example: 12345 },
          contentType: { type: "string", example: "image/webp" },
          lastModified: { type: "string", format: "date-time" },
          dbFile: { $ref: "#/components/schemas/DbFile" },
        },
      },
      UploadedFile: {
        type: "object",
        properties: {
          id: { type: "integer", nullable: true },
          originalName: { type: "string", example: "sample.png" },
          storedName: { type: "string", example: "sample.webp" },
          key: { type: "string", example: "images/uuid.webp" },
          url: { type: "string", format: "uri" },
          expiresIn: { type: "integer", example: 600 },
          size: { type: "integer", nullable: true },
          contentType: { type: "string", example: "image/webp" },
          lastModified: {
            type: "string",
            format: "date-time",
            nullable: true,
          },
          dbFile: { $ref: "#/components/schemas/DbFile" },
        },
      },
      DbFile: {
        type: "object",
        nullable: true,
        properties: {
          id: { type: "integer", example: 1 },
          originalName: { type: "string", example: "sample.png" },
          storedName: { type: "string", example: "sample.webp" },
          storageType: { type: "string", example: "supabase" },
          filePath: { type: "string", example: "" },
          bucket: { type: "string", example: "ITGwangju_dev" },
          storageKey: { type: "string", example: "images/uuid.webp" },
          publicUrl: { type: "string", example: "" },
          mimeType: { type: "string", example: "image/webp" },
          fileSize: { type: "integer", example: 12345 },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      LocalUploadFilesResponse: {
        allOf: [
          { $ref: "#/components/schemas/ApiResponse" },
          {
            type: "object",
            properties: {
              data: {
                type: "array",
                items: { $ref: "#/components/schemas/LocalFile" },
              },
            },
          },
        ],
      },
      LocalSingleFileResponse: {
        allOf: [
          { $ref: "#/components/schemas/ApiResponse" },
          {
            type: "object",
            properties: {
              data: { $ref: "#/components/schemas/LocalFile" },
            },
          },
        ],
      },
      LocalListFilesResponse: {
        allOf: [
          { $ref: "#/components/schemas/ApiResponse" },
          {
            type: "object",
            properties: {
              data: {
                type: "array",
                items: { $ref: "#/components/schemas/LocalFile" },
              },
            },
          },
        ],
      },
      UploadFilesResponse: {
        allOf: [
          { $ref: "#/components/schemas/ApiResponse" },
          {
            type: "object",
            properties: {
              data: {
                type: "array",
                items: { $ref: "#/components/schemas/UploadedFile" },
              },
            },
          },
        ],
      },
      SingleUploadResponse: {
        allOf: [
          { $ref: "#/components/schemas/ApiResponse" },
          {
            type: "object",
            properties: {
              data: { $ref: "#/components/schemas/UploadedFile" },
            },
          },
        ],
      },
      ListFilesResponse: {
        allOf: [
          { $ref: "#/components/schemas/ApiResponse" },
          {
            type: "object",
            properties: {
              data: {
                type: "array",
                items: { $ref: "#/components/schemas/StorageFile" },
              },
            },
          },
        ],
      },
      FileInfoResponse: {
        allOf: [
          { $ref: "#/components/schemas/ApiResponse" },
          {
            type: "object",
            properties: {
              data: {
                allOf: [
                  { $ref: "#/components/schemas/StorageFile" },
                  {
                    type: "object",
                    properties: {
                      url: { type: "string", format: "uri" },
                      expiresIn: { type: "integer" },
                      dbFile: { $ref: "#/components/schemas/DbFile" },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
      SignedUrlResponse: {
        allOf: [
          { $ref: "#/components/schemas/ApiResponse" },
          {
            type: "object",
            properties: {
              data: {
                type: "object",
                properties: {
                  key: { type: "string" },
                  url: { type: "string", format: "uri" },
                  expiresIn: { type: "integer" },
                  dbFile: { $ref: "#/components/schemas/DbFile" },
                },
              },
            },
          },
        ],
      },
      DeleteFileResponse: {
        allOf: [
          { $ref: "#/components/schemas/ApiResponse" },
          {
            type: "object",
            properties: {
              data: {
                type: "object",
                properties: {
                  key: { type: "string" },
                },
              },
            },
          },
        ],
      },
      CopyMoveRequest: {
        type: "object",
        required: ["sourceKey", "destinationKey"],
        properties: {
          sourceKey: { type: "string", example: "images/source.webp" },
          destinationKey: {
            type: "string",
            example: "images/destination.webp",
          },
          expiresIn: { type: "integer", default: 600 },
        },
      },
    },
  },
} as const;

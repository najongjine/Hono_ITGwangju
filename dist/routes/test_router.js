import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
const router = new Hono();
router.get("/", async (c) => {
    let result = {
        success: true,
        data: null,
        code: "",
        message: ``,
    };
    try {
        String(c.req.query("q") ?? "");
        return c.json(result);
    }
    catch (error) {
        result.success = false;
        result.message = `error. ${error?.message ?? ""}`;
        return c.json(result);
    }
});
async function makeEmbedding(queryText) {
    const apiUrl = "https://wildojisan-embeddinggemma-300m-fastapi.hf.space/make_text_embedding";
    const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            query: queryText,
            documents: [queryText],
        }),
    });
    if (!response.ok) {
        throw new Error(`API 요청 실패. HTTP 상태 코드: ${response.status}`);
    }
    const apiResponse = await response.json();
    if (!apiResponse.success || !apiResponse.data?.length) {
        throw new Error(`임베딩 API 오류: ${apiResponse.msg || "알 수 없는 응답"}`);
    }
    return apiResponse.data[0];
}
router.get("/save_embedding_to_db", async (c) => {
    let result = {
        success: true,
        data: null,
        code: "",
        message: ``,
    };
    try {
        const queryText = String(c.req.query("q") ?? "기본 쿼리 텍스트");
        const embeddingVector = await makeEmbedding(queryText);
        const vectorString = `[${embeddingVector.join(",")}]`;
        const dbResult = await db.execute(sql `
      INSERT INTO t_vector_test1 (content, embedding)
      VALUES (${queryText}, ${vectorString})
      RETURNING id
    `);
        result.data = {
            id: dbResult.rows[0]?.id,
            query: queryText,
            vector_length: embeddingVector.length,
            first_5_values: embeddingVector.slice(0, 5),
        };
        result.message = `임베딩을 성공적으로 받았습니다. 벡터 길이: ${embeddingVector.length}`;
        return c.json(result);
    }
    catch (error) {
        result.success = false;
        result.message = `error. ${error?.message ?? ""}`;
        return c.json(result);
    }
});
router.get("/postgres_embedding_search", async (c) => {
    let result = {
        success: true,
        data: null,
        code: "",
        message: ``,
    };
    try {
        const queryText = String(c.req.query("q") ?? "기본 쿼리 텍스트");
        const embeddingVector = await makeEmbedding(queryText);
        const vectorString = `[${embeddingVector.join(",")}]`;
        const dbResult = await db.execute(sql `
      SELECT
        id,
        content,
        embedding <=> ${vectorString} AS distance_score
      FROM t_vector_test1
      WHERE (embedding <=> ${vectorString}) <= 0.6
      ORDER BY distance_score ASC
      LIMIT 10
    `);
        result.data = dbResult.rows;
        return c.json(result);
    }
    catch (error) {
        result.success = false;
        result.message = `error. ${error?.message ?? ""}`;
        return c.json(result);
    }
});
export default router;

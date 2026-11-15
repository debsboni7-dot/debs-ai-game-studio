import { describe, expect, it, vi } from "vitest";
import { retrieveDebsMemoryContext } from "./memory.server";

function makeClient(enabled: boolean) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      calls.push(table);
      const query: any = {
        select: () => query,
        eq: () => query,
        textSearch: (_column: string, value: string) => { query.search = value; return query; },
        order: () => query,
        maybeSingle: async () => ({ data: { enabled }, error: null }),
        limit: async () => ({
          data: table === "debs_memories"
            ? [{ content: "The user's project is ASTREA.", memory_type: "project", importance: 9 }]
            : [{ title: "DEBS policy", content: "Training requires human approval.", source_reference: "policy.md" }],
          error: null,
        }),
      };
      return query;
    },
  };
  return { client, calls };
}

describe("DEBS memory retrieval", () => {
  it("does not read personal memories when the user has disabled memory", async () => {
    const { client, calls } = makeClient(false);
    const result = await retrieveDebsMemoryContext(client, "user-1", [{ role: "user", content: "How do we train the model?" }]);
    expect(calls).toContain("debs_knowledge_documents");
    expect(calls).not.toContain("debs_memories");
    expect(result).toContain("DEBS policy");
    expect(result).not.toContain("ASTREA");
  });

  it("includes personal memories only when the preference is enabled", async () => {
    const { client, calls } = makeClient(true);
    const result = await retrieveDebsMemoryContext(client, "user-1", [{ role: "user", content: "How do we train the model?" }]);
    expect(calls).toContain("debs_memories");
    expect(result).toContain("ASTREA");
    expect(result).toContain("untrusted reference data");
  });

  it("does not create context for an empty user query", async () => {
    const { client, calls } = makeClient(true);
    const result = await retrieveDebsMemoryContext(client, "user-1", [{ role: "user", content: "   " }]);
    expect(result).toBe("");
    expect(calls).toHaveLength(0);
  });
});

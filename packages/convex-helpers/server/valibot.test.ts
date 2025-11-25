import { describe, expect, expectTypeOf, test } from "vitest";
import * as vbot from "valibot";
import { v, type GenericId, type Infer } from "convex/values";
import {
    valibotToConvex,
    valibotCustomQuery,
    valibotToConvexFields,
    withSystemFields,
    zid,
} from "./valibot.js";
import { queryGeneric, defineSchema, defineTable } from "convex/server";
import { Equals } from "..";

function assert<_T extends true>() {}

const schema = defineSchema({
    users: defineTable({
        name: v.string(),
    }),
});

const query = queryGeneric;

describe("valibotToConvex", () => {
    test("string", () => {
        const valibotValidator = vbot.string();
        const convexValidator = v.string();
        const result = valibotToConvex(valibotValidator);
        
        // Runtime check - verify the validator structure
        expect(result).toEqual(convexValidator);

        // Type check
        assert<Equals<typeof result, typeof convexValidator>>();
        expectTypeOf<Infer<typeof result>>().toEqualTypeOf<string>();
    });
    test("number", () => {
        const valibotValidator = vbot.number();
        const convexValidator = v.number();
        const result = valibotToConvex(valibotValidator);
        
        // Runtime check - verify the validator structure
        expect(result).toEqual(convexValidator);

        // Type check
        assert<Equals<typeof result, typeof convexValidator>>();
        expectTypeOf<Infer<typeof result>>().toEqualTypeOf<number>();
    });
    test("boolean", () => {
        const valibotValidator = vbot.boolean();
        const convexValidator = v.boolean();
        const result = valibotToConvex(valibotValidator);
        
        // Runtime check - verify the validator structure
        expect(result).toEqual(convexValidator);

        // Type check
        assert<Equals<typeof result, typeof convexValidator>>();
        expectTypeOf<Infer<typeof result>>().toEqualTypeOf<boolean>();
    });
    test("null", () => {
        const valibotValidator = vbot.null();
        const convexValidator = v.null();
        const result = valibotToConvex(valibotValidator);
        
        // Runtime check - verify the validator structure
        expect(result).toEqual(convexValidator);

        // Type check
        assert<Equals<typeof result, typeof convexValidator>>();
        expectTypeOf<Infer<typeof result>>().toEqualTypeOf<null>();
    });
    test("object", () => {
        const valibotValidator = vbot.object({
            name: vbot.string(),
            age: vbot.number(),
        });
        const convexValidator = v.object({
            name: v.string(),
            age: v.number(),
        });
        const result = valibotToConvex(valibotValidator);
        
        // Runtime check - verify the validator structure
        expect(result).toEqual(convexValidator);

        // Type check
        expectTypeOf<Infer<typeof result>>().toEqualTypeOf<{
            name: string;
            age: number;
        }>();
    });
    test("array", () => {
        const valibotValidator = vbot.array(vbot.string());
        const convexValidator = v.array(v.string());
        const result = valibotToConvex(valibotValidator);
        
        // Runtime check - verify the validator structure
        expect(result).toEqual(convexValidator);

        // Type check
        assert<Equals<typeof result, typeof convexValidator>>();
        expectTypeOf<Infer<typeof result>>().toEqualTypeOf<string[]>();
    });
    test("optional", () => {
        const valibotValidator = vbot.optional(vbot.string());
        const convexValidator = v.optional(v.string());
        const result = valibotToConvex(valibotValidator);
        
        // Runtime check - verify the validator structure
        expect(result).toEqual(convexValidator);

        // Type check
        assert<Equals<typeof result, typeof convexValidator>>();
        expectTypeOf<Infer<typeof result>>().toEqualTypeOf<string | undefined>();
    });
    test("zid", () => {
        const valibotValidator = zid("users");
        const convexValidator = v.id("users");
        const result = valibotToConvex(valibotValidator);
        
        // Runtime check - verify the validator structure
        expect(result).toEqual(convexValidator);

        // Type check
        assert<Equals<typeof result, typeof convexValidator>>();
        expectTypeOf<Infer<typeof result>>().toEqualTypeOf<GenericId<"users">>();
    });
});

describe("valibotToConvexFields", () => {
    test("basic fields", () => {
        const convexFields = valibotToConvexFields({
            name: vbot.string(),
            age: vbot.optional(vbot.number()),
        });

        expect(convexFields.name).toEqual(v.string());
        expect(convexFields.age).toEqual(v.optional(v.number()));

        expectTypeOf<Infer<typeof convexFields.name>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof convexFields.age>>().toEqualTypeOf<number | undefined>();
    });
});

describe("withSystemFields", () => {
    test("adds convex metadata fields", () => {
        const schema = withSystemFields("users", {
            name: vbot.string(),
            age: vbot.number(),
        });

        expect(schema.name).toBeDefined();
        expect(schema.age).toBeDefined();
        expect(schema._id).toBeDefined();
        expect(schema._creationTime).toBeDefined();

        expectTypeOf<keyof typeof schema>().toEqualTypeOf<"name" | "age" | "_id" | "_creationTime">();
    });
});

describe("valibotCustomQuery", () => {
    const zQuery = valibotCustomQuery(query, {
        args: {},
        input: async () => ({ ctx: {}, args: {} }),
    });

    test("basic usage", async () => {
        const myQuery = zQuery({
            args: {
                name: vbot.string(),
            },
            handler: async (ctx, args) => {
                return `Hello ${args.name}`;
            },
        });

        // For now, let's just verify the builder returns something that looks like a query.
        expect(myQuery).toBeDefined();
        expect(myQuery.isQuery).toBe(true);
    });
});

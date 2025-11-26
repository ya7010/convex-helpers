import { ConvexError, v } from "convex/values";
import type {
    GenericId,
    GenericValidator,
    ObjectType,
    PropertyValidators,
    Validator,
    VAny,
    VArray,
    VBoolean,
    VFloat64,
    VId,
    VLiteral,
    VNull,
    VObject,
    VOptional,
    VRecord,
    VString,
    VUnion,
} from "convex/values";
import * as vbot from "valibot";
import type {
    ActionBuilder,
    FunctionVisibility,
    GenericActionCtx,
    GenericDataModel,
    GenericMutationCtx,
    GenericQueryCtx,
    MutationBuilder,
    QueryBuilder,
    TableNamesInDataModel,
} from "convex/server";
import { pick, type Expand } from "../index.js";
import type { Customization, Registration } from "./customFunctions.js";
import { NoOp } from "./customFunctions.js";
import { addFieldsToValidator } from "../validators.js";

const ZID_SYMBOL = Symbol("convex-helpers:valibot:zid");

type ZidMarker<TableName extends string = string> = {
    [ZID_SYMBOL]: TableName;
};

type ZidSchema<TableName extends string> = vbot.GenericSchema & ZidMarker<TableName>;

// #region Convex function definition with Valibot

/**
 * valibotCustomQuery is like customQuery, but allows validation via valibot.
 *
 * @param query The query to be modified. Usually `query` or `internalQuery`
 *   from `_generated/server`.
 * @param customization The customization to be applied to the query, changing ctx and args.
 * @returns A new query builder using valibot validation to define queries.
 */
export function valibotCustomQuery<
    CustomArgsValidator extends PropertyValidators,
    CustomCtx extends Record<string, any>,
    CustomMadeArgs extends Record<string, any>,
    Visibility extends FunctionVisibility,
    DataModel extends GenericDataModel,
    ExtraArgs extends Record<string, any> = object,
>(
    query: QueryBuilder<DataModel, Visibility>,
    customization: Customization<
        GenericQueryCtx<DataModel>,
        CustomArgsValidator,
        CustomCtx,
        CustomMadeArgs,
        ExtraArgs
    >,
) {
    return customFnBuilder(query, customization) as CustomBuilder<
        "query",
        CustomArgsValidator,
        CustomCtx,
        CustomMadeArgs,
        GenericQueryCtx<DataModel>,
        Visibility,
        ExtraArgs
    >;
}

/**
 * valibotCustomMutation is like customMutation, but allows validation via valibot.
 *
 * @param mutation The mutation to be modified. Usually `mutation` or `internalMutation`
 *   from `_generated/server`.
 * @param customization The customization to be applied to the mutation, changing ctx and args.
 * @returns A new mutation builder using valibot validation to define queries.
 */
export function valibotCustomMutation<
    CustomArgsValidator extends PropertyValidators,
    CustomCtx extends Record<string, any>,
    CustomMadeArgs extends Record<string, any>,
    Visibility extends FunctionVisibility,
    DataModel extends GenericDataModel,
    ExtraArgs extends Record<string, any> = object,
>(
    mutation: MutationBuilder<DataModel, Visibility>,
    customization: Customization<
        GenericMutationCtx<DataModel>,
        CustomArgsValidator,
        CustomCtx,
        CustomMadeArgs,
        ExtraArgs
    >,
) {
    return customFnBuilder(mutation, customization) as CustomBuilder<
        "mutation",
        CustomArgsValidator,
        CustomCtx,
        CustomMadeArgs,
        GenericMutationCtx<DataModel>,
        Visibility,
        ExtraArgs
    >;
}

/**
 * valibotCustomAction is like customAction, but allows validation via valibot.
 *
 * @param action The action to be modified. Usually `action` or `internalAction`
 *   from `_generated/server`.
 * @param customization The customization to be applied to the action, changing ctx and args.
 * @returns A new action builder using valibot validation to define queries.
 */
export function valibotCustomAction<
    CustomArgsValidator extends PropertyValidators,
    CustomCtx extends Record<string, any>,
    CustomMadeArgs extends Record<string, any>,
    Visibility extends FunctionVisibility,
    DataModel extends GenericDataModel,
    ExtraArgs extends Record<string, any> = object,
>(
    action: ActionBuilder<DataModel, Visibility>,
    customization: Customization<
        GenericActionCtx<DataModel>,
        CustomArgsValidator,
        CustomCtx,
        CustomMadeArgs,
        ExtraArgs
    >,
) {
    return customFnBuilder(action, customization) as CustomBuilder<
        "action",
        CustomArgsValidator,
        CustomCtx,
        CustomMadeArgs,
        GenericActionCtx<DataModel>,
        Visibility,
        ExtraArgs
    >;
}

// #endregion

// #region Convex IDs

/**
 * Creates a validator for a Convex `Id`.
 *
 * @param tableName - The table that the `Id` references. i.e. `Id<tableName>`
 * @returns A Valibot schema representing a Convex `Id`
 */
export const zid = <
    DataModel extends GenericDataModel,
    TableName extends
    TableNamesInDataModel<DataModel> = TableNamesInDataModel<DataModel>,
>(
    tableName: TableName,
) => {
    const schema = vbot.custom<GenericId<TableName>>(
        (val) => typeof val === "string",
        `Invalid Id for table ${tableName}`,
    ) as unknown as ZidSchema<TableName>;
    schema[ZID_SYMBOL] = tableName;
    return schema;
};

// #endregion

// #region Valibot → Convex

/**
 * Checks if a validator is valid for use as a record key.
 * Record keys must be v.string(), v.id(), or a union of them.
 */
function isValidRecordKey(validator: GenericValidator): boolean {
    if (validator.kind === "string" || validator.kind === "id") {
        return true;
    }
    if (validator.kind === "union") {
        const unionValidator = validator as VUnion<any, any, any, any>;
        return unionValidator.members.every(isValidRecordKey);
    }
    return false;
}

/**
 * Turns a Valibot validator into a Convex validator.
 *
 * @param schema Valibot schema
 * @returns Convex Validator
 */
export function valibotToConvex<T extends vbot.GenericSchema>(
    schema: T,
): ConvexValidatorFromValibot<T> {
    const anySchema = schema as any;
    const zidTableName = (schema as Partial<ZidMarker>)[ZID_SYMBOL];
    if (zidTableName) {
        return v.id(zidTableName) as any;
    }

    if (anySchema.type === "string") {
        return v.string() as any;
    }
    if (anySchema.type === "number") {
        return v.number() as any;
    }
    if (anySchema.type === "boolean") {
        return v.boolean() as any;
    }
    if (anySchema.type === "null") {
        return v.null() as any;
    }
    if (anySchema.type === "object") {
        const entries = anySchema.entries;
        const fields: Record<string, any> = {};
        for (const key in entries) {
            fields[key] = valibotToConvex(entries[key]);
        }
        return v.object(fields) as any;
    }
    if (anySchema.type === "array") {
        return v.array(valibotToConvex(anySchema.item)) as any;
    }
    if (anySchema.type === "optional") {
        return v.optional(valibotToConvex(anySchema.wrapped)) as any;
    }
    if (anySchema.type === "union") {
        return v.union(...anySchema.options.map(valibotToConvex)) as any;
    }
    if (anySchema.type === "literal") {
        return v.literal(anySchema.value) as any;
    }
    if (anySchema.type === "picklist") {
        // picklist is like enum, maps to union of literals
        return v.union(...anySchema.options.map((opt: any) => v.literal(opt))) as any;
    }
    if (anySchema.type === "record") {
        // Convex only supports string keys for records
        // Valibot record has key and value schemas
        // But Convex v.record first arg is key validator, second is value validator.
        // Key must be v.string() or v.id() or union of them.
        const keyValidator = valibotToConvex(anySchema.key);
        const valueValidator = valibotToConvex(anySchema.value);
        // Check if key validator is valid for record keys (string, id, or union of them)
        const validKey = isValidRecordKey(keyValidator) 
            ? (keyValidator as Validator<string, "required", any>)
            : v.string();
        return v.record(validKey, valueValidator) as any;
    }
    if (anySchema.type === "variant") {
        // Discriminated union
        return v.union(...anySchema.options.map(valibotToConvex)) as any;
    }
    if (anySchema.type === "custom") {
        // For other custom validators, return v.any() as fallback
        return v.any() as any;
    }

    return v.any() as any;
}

/**
 * Like {@link valibotToConvex}, but it takes in a bare object.
 */
export function valibotToConvexFields<Fields extends Record<string, vbot.GenericSchema>>(fields: Fields) {
    return Object.fromEntries(
        Object.entries(fields).map(([k, v]) => [k, valibotToConvex(v)]),
    ) as {
            [k in keyof Fields]: ConvexValidatorFromValibot<Fields[k]>
        };
}

// #endregion

// #region Utils

/**
 * Valibot helper for adding Convex system fields to a record to return.
 */
export function withSystemFields<
    Table extends string,
    T extends Record<string, vbot.GenericSchema>,
>(tableName: Table, valibotObject: T) {
    return { ...valibotObject, _id: zid(tableName), _creationTime: vbot.number() };
}

// #endregion

// #region Implementation Details

/**
 * Converts a Valibot schema type to the corresponding Convex validator type.
 * 
 * This type maps Valibot schema types to Convex validator types:
 * - `string` → `VString`
 * - `number` → `VFloat64`
 * - `boolean` → `VBoolean`
 * - `null` → `VNull`
 * - `object` → `VObject`
 * - `array` → `VArray`
 * - `optional` → `VOptional`
 * - `union` → `VUnion`
 * - `literal` → `VLiteral`
 * - `picklist` → `VUnion` (union of literals)
 * - `record` → `VRecord`
 * - `variant` → `VUnion` (discriminated union)
 * - `custom` → `VId` (if it's a zid with _def.typeName === "ConvexId"), otherwise `VAny`
 */
type ConvexValidatorFromValibot<T extends vbot.GenericSchema> =
    // Keep this in sync with valibotToConvex implementation
    T extends ZidMarker<infer TableName>
        ? VId<GenericId<TableName>>
        : T extends { type: "string" }
        ? VString
        : T extends { type: "number" }
            ? VFloat64
            : T extends { type: "boolean" }
                ? VBoolean
                : T extends { type: "null" }
                    ? VNull
                    : T extends { type: "object"; entries: infer Entries }
                        ? Entries extends Record<string, vbot.GenericSchema>
                            ? VObject<
                                    ObjectType<{
                                        [K in keyof Entries]: ConvexValidatorFromValibot<Entries[K]>;
                                    }>,
                                    {
                                        [K in keyof Entries]: ConvexValidatorFromValibot<Entries[K]>;
                                    }
                                >
                            : VAny
                        : T extends { type: "array"; item: infer Item }
                            ? Item extends vbot.GenericSchema
                                ? VArray<
                                        ConvexValidatorFromValibot<Item>["type"][],
                                        ConvexValidatorFromValibot<Item>
                                    >
                                : VAny
                            : T extends { type: "optional"; wrapped: infer Wrapped }
                                ? Wrapped extends vbot.GenericSchema
                                    ? ConvexValidatorFromValibot<Wrapped> extends GenericValidator
                                        ? VOptional<ConvexValidatorFromValibot<Wrapped>>
                                        : VAny
                                    : VAny
                                : T extends { type: "union"; options: infer Options }
                                    ? Options extends readonly vbot.GenericSchema[]
                                        ? VUnion<
                                                ConvexValidatorFromValibot<Options[number]>["type"],
                                        ValidatorsFromValibotOptions<Options>,
                                                "required",
                                                ConvexValidatorFromValibot<Options[number]>["fieldPaths"]
                                            >
                                        : VAny
                                    : T extends { type: "literal"; value: infer Value }
                                        ? VLiteral<Value>
                                        : T extends { type: "picklist"; options: infer Options }
                                            ? Options extends readonly (string | number | boolean)[]
                                                ? VUnion<
                                                        Options[number],
                                                        LiteralsFromPicklistOptions<Options>,
                                                        "required",
                                                        VLiteral<Options[number]>["fieldPaths"]
                                                    >
                                                : VAny
                                            : T extends { type: "record"; key: infer Key; value: infer Value }
                                                ? Key extends vbot.GenericSchema
                                                    ? Value extends vbot.GenericSchema
                                                        ? VRecord<
                                                                Record<
                                                                    ConvexValidatorFromValibot<Key>["type"],
                                                                    ConvexValidatorFromValibot<Value>["type"]
                                                                >,
                                                                ConvexValidatorFromValibot<Key>,
                                                                ConvexValidatorFromValibot<Value>,
                                                                "required",
                                                                ConvexValidatorFromValibot<Value>["fieldPaths"]
                                                            >
                                                        : VAny
                                                    : VAny
                                                : T extends { type: "variant"; options: infer Options }
                                                    ? Options extends readonly vbot.GenericSchema[]
                                                        ? VUnion<
                                                                ConvexValidatorFromValibot<Options[number]>["type"],
                                                                ValidatorsFromValibotOptions<Options>,
                                                                "required",
                                                                ConvexValidatorFromValibot<Options[number]>["fieldPaths"]
                                                            >
                                                        : VAny
                                                    : T extends { type: "custom" }
                                                        ? VAny
                                                        : VAny;

type MutableTuple<T extends readonly any[]> = { -readonly [P in keyof T]: T[P] };

type ValidatorsFromValibotOptions<Options extends readonly vbot.GenericSchema[]> =
    MutableTuple<{
        [Index in keyof Options]: Options[Index] extends vbot.GenericSchema
            ? ConvexValidatorFromValibot<Options[Index]> extends GenericValidator
                ? ConvexValidatorFromValibot<Options[Index]>
                : never
            : never;
    }> extends infer Result
        ? Result extends Validator<any, "required", any>[]
            ? Result
            : never
        : never;

type LiteralsFromPicklistOptions<Options extends readonly (string | number | boolean)[]> =
    MutableTuple<{
        [Index in keyof Options]: VLiteral<Options[Index]>;
    }>;

function customFnBuilder(
    builder: (args: any) => any,
    customization: Customization<any, any, any, any, any>,
) {
    const customInput = customization.input ?? NoOp.input;
    const inputArgs = customization.args ?? NoOp.args;

    return function customBuilder(fn: any): any {
        const { args, handler = fn, ...extra } = fn;

        if (args && !fn.skipConvexValidation) {
            let convexValidator;
            if (args.type === 'object') {
                convexValidator = valibotToConvexFields(args.entries);
            } else {
                convexValidator = valibotToConvexFields(args);
            }

            return builder({
                args: addFieldsToValidator(convexValidator, inputArgs),
                handler: async (ctx: any, allArgs: any) => {
                    const added = await customInput(
                        ctx,
                        pick(allArgs, Object.keys(inputArgs)) as any,
                        extra,
                    );

                    let schema = args;
                    if (args.type !== 'object' && !args.parse) {
                        schema = vbot.object(args);
                    }

                    const rawArgs = pick(allArgs, Object.keys(convexValidator));
                    const result = vbot.safeParse(schema, rawArgs);

                    if (!result.success) {
                        throw new ConvexError({
                            ValibotError: result.issues,
                        });
                    }

                    const finalArgs = { ...result.output, ...added.args };
                    const finalCtx = { ...ctx, ...added.ctx };

                    const ret = await handler(finalCtx, finalArgs);
                    if (added.onSuccess) {
                        await added.onSuccess({ ctx, args: finalArgs, result: ret });
                    }
                    return ret;
                }
            });
        }

        return builder({
            handler: async (ctx: any, args: any) => {
                const added = await customInput(ctx, args, extra);
                const finalCtx = { ...ctx, ...added.ctx };
                const finalArgs = { ...args, ...added.args };
                const ret = await handler(finalCtx, finalArgs);
                if (added.onSuccess) {
                    await added.onSuccess({ ctx, args, result: ret });
                }
                return ret;
            },
        });
    };
}

export type CustomBuilder<
    FuncType extends "query" | "mutation" | "action",
    CustomArgsValidator extends PropertyValidators,
    CustomCtx extends Record<string, any>,
    CustomMadeArgs extends Record<string, any>,
    InputCtx,
    Visibility extends FunctionVisibility,
    ExtraArgs extends Record<string, any>,
> = {
    <
        ArgsValidator extends vbot.GenericSchema | Record<string, vbot.GenericSchema> | void,
        ReturnValue = any,
    >(
        func:
            | ({
                args?: ArgsValidator;
                handler: (
                    ctx: Expand<InputCtx & CustomCtx>,
                    ...args: any[]
                ) => ReturnValue;
                skipConvexValidation?: boolean;
            } & ExtraArgs)
            | ((
                ctx: Expand<InputCtx & CustomCtx>,
                ...args: any[]
            ) => ReturnValue),
    ): Registration<
        FuncType,
        Visibility,
        any,
        ReturnValue
    >;
};

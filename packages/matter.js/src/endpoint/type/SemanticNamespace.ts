/**
 * @license
 * Copyright 2022-2024 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Semtag } from "../../cluster/globals/Semtag.js";
import { VendorId } from "../../datatype/VendorId.js";

/**
 * A Matter "semantic namespace" is a discrete set of {@link Semtag} definitions.
 */
export type SemanticNamespace = Record<string, Semtag>;

/**
 * Define a new semantic namespace.
 */
export function SemanticNamespace<const T extends SemanticNamespace.Definition>(definition: T) {
    const result = {} as Record<string, Semtag>;

    const { tags } = definition;
    const namespaceId = definition.id;
    const mfgCode = definition.mfgCode ? VendorId(definition.mfgCode) : null;

    for (const key in tags) {
        const { id, name } = definition.tags[key];

        result[key] = {
            namespaceId,
            mfgCode,
            tag: id,
            label: name,
        };
    }

    return result as SemanticNamespace.Of<T>;
}

export namespace SemanticNamespace {
    export interface Definition {
        id: number;
        mfgCode?: number;
        tags: {
            [name: string]: { id: number; name: string };
        };
    }

    export type Of<T extends Definition> = {
        [name in keyof T["tags"]]: Semtag;
    };
}

/**
 * @license
 * Copyright 2022 Project CHIP Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ByteArray } from "../util/ByteArray";
import { DataReaderLE } from "../util/DataReaderLE";
import { DataWriterLE } from "../util/DataWriterLE";
import { BitmapSchema, BitFieldEnum, BitField } from "../util/schema/BitmapSchema";

/**
 * TLV element types.
 * 
 * @see {@link MatterCoreSpecificationV1_0} § A.7.1
 */
export const enum TlvType {
    SignedInt = 0x00,
    UnsignedInt = 0x04,
    Boolean = 0x08,
    Float = 0x0A,
    Utf8String = 0x0C,
    ByteString = 0x10,
    Null = 0x14,
    Structure = 0x15,
    Array = 0x16,
    List = 0x17,
    EndOfContainer = 0x18,
}

export const enum TlvLength {
    OneByte = 0,
    TwoBytes = 1,
    FourBytes = 2,
    EightBytes = 3,
}

export type TlvTypeLength = 
    { type: TlvType.SignedInt, length: TlvLength }
    | { type: TlvType.UnsignedInt, length: TlvLength }
    | { type: TlvType.Boolean, value: boolean }
    | { type: TlvType.Float, length: TlvLength.FourBytes | TlvLength.EightBytes }
    | { type: TlvType.Utf8String, length: TlvLength }
    | { type: TlvType.ByteString, length: TlvLength }
    | { type: TlvType.Null }
    | { type: TlvType.Structure }
    | { type: TlvType.Array }
    | { type: TlvType.List }
    | { type: TlvType.EndOfContainer };

type TlvToPrimitive = {
    [TlvType.SignedInt]: bigint | number,
    [TlvType.UnsignedInt]: bigint | number,
    [TlvType.Boolean]: never,
    [TlvType.Float]: number,
    [TlvType.Utf8String]: string,
    [TlvType.ByteString]: ByteArray,
    [TlvType.Null]: null,
    [TlvType.Structure]: never,
    [TlvType.Array]: never,
    [TlvType.List]: never,
    [TlvType.EndOfContainer]: never,
};

/**
 * TLV element tag control.
 * 
 * @see {@link MatterCoreSpecificationV1_0} § A.7.2
 */
const enum TagControl {
    Anonymous = 0,
    ContextSpecific = 1,
    CommonProfile16 = 2,
    CommonProfile32 = 3,
    ImplicitProfile16 = 4,
    ImplicitProfile32 = 5,
    FullyQualified48 = 6,
    FullyQualified64 = 7,
}

const ControlByteSchema = BitmapSchema({
    typeLength: BitField(0, 5),
    tagControl: BitFieldEnum<TagControl>(5, 3),
});

const COMMON_PROFILE = 0x00000000;

export type TlvTag = {
    profile?: number,
    id?: number,
};

const UINT8_MAX = 0xFF;
const UINT16_MAX = 0xFFFF;
const UINT32_MAX = 0xFFFFFFFF;

function getUIntEncodedLength(value: number | bigint) {
    if (value <= UINT8_MAX) {
        return TlvLength.OneByte;
    } else if (value <= UINT16_MAX) {
        return TlvLength.TwoBytes;
    } else if (value <= UINT32_MAX) {
        return TlvLength.FourBytes;
    } else {
        return TlvLength.EightBytes;
    }
}

export class TlvCodec {

    /** @see {@link MatterCoreSpecificationV1_0} § A.7 */
    public static readTagType(reader: DataReaderLE): { tag: TlvTag, typeLength: TlvTypeLength } {
        const { tagControl, typeLength } = ControlByteSchema.decode(reader.readUInt8());
        return { tag: this.readTag(reader, tagControl), typeLength: this.parseTypeLength(typeLength) };
    }

    private static readTag(reader: DataReaderLE, tagControl: TagControl): TlvTag {
        switch (tagControl) {
            case TagControl.Anonymous:
                return {};
            case TagControl.ContextSpecific:
                return { id: reader.readUInt8() };
            case TagControl.CommonProfile16:
                return { profile: COMMON_PROFILE, id: reader.readUInt16() };
            case TagControl.CommonProfile32:
                return { profile: COMMON_PROFILE, id: reader.readUInt32() };
            case TagControl.ImplicitProfile16:
            case TagControl.ImplicitProfile32:
                throw new Error(`Unsupported implicit profile ${tagControl}`);
            case TagControl.FullyQualified48:
                return { profile: reader.readUInt32(), id: reader.readUInt16() };
            case TagControl.FullyQualified48:
                return { profile: reader.readUInt32(), id: reader.readUInt32() };
            default:
                throw new Error(`Unexpected tagControl ${tagControl}`);
        }
    }

    private static parseTypeLength(typeLength: number): TlvTypeLength {
        const length = (typeLength & 0x03) as TlvLength;
        const type = typeLength & 0xFC;
        switch (type) {
            case TlvType.Utf8String:
            case TlvType.ByteString:
            case TlvType.SignedInt:
            case TlvType.UnsignedInt:
                return { type, length };
            case TlvType.Boolean:
                switch (length) {
                    case TlvLength.OneByte: return { type, value: false };
                    case TlvLength.TwoBytes: return { type, value: true };
                    case TlvLength.FourBytes: return { type: TlvType.Float, length };
                    case TlvLength.EightBytes: return { type: TlvType.Float, length };
                }
            default:
                return { type: typeLength };
        }
    }

    public static readPrimitive<T extends TlvTypeLength, V = TlvToPrimitive[T["type"]]>(reader: DataReaderLE, typeLength: T): V {
        switch (typeLength.type) {
            case TlvType.SignedInt:
                switch (typeLength.length) {
                    case TlvLength.OneByte: return reader.readInt8() as V;
                    case TlvLength.TwoBytes: return reader.readInt16() as V;
                    case TlvLength.FourBytes: return reader.readInt32() as V;
                    case TlvLength.EightBytes: return reader.readInt64() as V;
                }
            case TlvType.UnsignedInt:
                switch (typeLength.length) {
                    case TlvLength.OneByte: return reader.readUInt8() as V;
                    case TlvLength.TwoBytes: return reader.readUInt16() as V;
                    case TlvLength.FourBytes: return reader.readUInt32() as V;
                    case TlvLength.EightBytes: return reader.readUInt64() as V;
                }
            case TlvType.Float:
                switch (typeLength.length) {
                    case TlvLength.FourBytes: return reader.readFloat() as V;
                    case TlvLength.EightBytes: return reader.readDouble() as V;
                }
            case TlvType.Utf8String:
                switch (typeLength.length) {
                    case TlvLength.OneByte: return reader.readUtfString(reader.readUInt8()) as V;
                    case TlvLength.TwoBytes: return reader.readUtfString(reader.readUInt16()) as V;
                    case TlvLength.FourBytes: return reader.readUtfString(reader.readUInt32()) as V;
                    case TlvLength.EightBytes: return reader.readUtfString(Number(reader.readUInt64())) as V;
                }
            case TlvType.ByteString:
                switch (typeLength.length) {
                    case TlvLength.OneByte: return reader.readByteArray(reader.readUInt8()) as V;
                    case TlvLength.TwoBytes: return reader.readByteArray(reader.readUInt16()) as V;
                    case TlvLength.FourBytes: return reader.readByteArray(reader.readUInt32()) as V;
                    case TlvLength.EightBytes: return reader.readByteArray(Number(reader.readUInt64())) as V;
                }
            case TlvType.Boolean:
                return typeLength.value as V;
            default:
                throw new Error(`Unexpected TLV type ${typeLength.type}`);
        }
    }

    /** @see {@link MatterCoreSpecificationV1_0} § A.7 & A.8 */
    public static writeTag(writer: DataWriterLE, typeLengthValue: TlvTypeLength, { profile, id }: TlvTag) {
        let typeLength: number;
        switch (typeLengthValue.type) {
            case TlvType.Utf8String:
            case TlvType.ByteString:
            case TlvType.SignedInt:
            case TlvType.UnsignedInt:
            case TlvType.Float:
                typeLength = typeLengthValue.type + typeLengthValue.length;
                break;
            case TlvType.Boolean:
                typeLength = typeLengthValue.type + (typeLengthValue.value ? 1 : 0);
                break;
            default:
                typeLength = typeLengthValue.type;
        }

        if (profile === undefined && id === undefined) {
            writer.writeUInt8(ControlByteSchema.encode({ tagControl: TagControl.Anonymous, typeLength }));
        } else if (profile === undefined) {
            if (id === undefined) throw new Error("Invalid TLV tag: id should be defined for a context specific tag.");
            writer.writeUInt8(ControlByteSchema.encode({ tagControl: TagControl.ContextSpecific, typeLength }));
            writer.writeUInt8(id);
        } else if (profile === COMMON_PROFILE) {
            if (id === undefined) throw new Error("Invalid TLV tag: id should be defined for a common profile.");
            if ((id & 0xFFFF0000) === 0) {
                writer.writeUInt8(ControlByteSchema.encode({ tagControl: TagControl.CommonProfile16, typeLength }));
                writer.writeUInt16(id);
            } else {
                writer.writeUInt8(ControlByteSchema.encode({ tagControl: TagControl.CommonProfile32, typeLength }));
                writer.writeUInt32(id);
            }
        } else {
            if (id === undefined) throw new Error("Invalid TLV tag: id should be defined for a custom profile.");
            if ((id & 0xFFFF0000) === 0) {
                writer.writeUInt8(ControlByteSchema.encode({ tagControl: TagControl.FullyQualified48, typeLength }));
                writer.writeUInt32(profile);
                writer.writeUInt16(id);
            } else {
                writer.writeUInt8(ControlByteSchema.encode({ tagControl: TagControl.FullyQualified64, typeLength }));
                writer.writeUInt32(profile);
                writer.writeUInt32(id);
            }
        }
    }

    public static writePrimitive<T extends TlvTypeLength>(writer: DataWriterLE, typeLength: T, value: TlvToPrimitive[T["type"]]) {
        switch (typeLength.type) {
            case TlvType.SignedInt:
                switch (typeLength.length) {
                    case TlvLength.OneByte: return writer.writeInt8(value as TlvToPrimitive[typeof typeLength.type]);
                    case TlvLength.TwoBytes: return writer.writeInt8(value as TlvToPrimitive[typeof typeLength.type]);
                    case TlvLength.FourBytes: return writer.writeInt8(value as TlvToPrimitive[typeof typeLength.type]);
                    case TlvLength.EightBytes: return writer.writeInt8(value as TlvToPrimitive[typeof typeLength.type]);
                }
            case TlvType.UnsignedInt:
                switch (typeLength.length) {
                    case TlvLength.OneByte: return writer.writeUInt8(value as TlvToPrimitive[typeof typeLength.type]);
                    case TlvLength.TwoBytes: return writer.writeUInt8(value as TlvToPrimitive[typeof typeLength.type]);
                    case TlvLength.FourBytes: return writer.writeUInt8(value as TlvToPrimitive[typeof typeLength.type]);
                    case TlvLength.EightBytes: return writer.writeUInt8(value as TlvToPrimitive[typeof typeLength.type]);
                }
            case TlvType.Float:
                switch (typeLength.length) {
                    case TlvLength.FourBytes: return writer.writeFloat(value as TlvToPrimitive[typeof typeLength.type]);
                    case TlvLength.EightBytes: return writer.writeDouble(value as TlvToPrimitive[typeof typeLength.type]);
                }
            case TlvType.Utf8String:
                switch (typeLength.length) {
                    case TlvLength.OneByte: return writer.writeUtf8String(value as TlvToPrimitive[typeof typeLength.type]);
                    case TlvLength.TwoBytes: return writer.writeUtf8String(value as TlvToPrimitive[typeof typeLength.type]);
                    case TlvLength.FourBytes: return writer.writeUtf8String(value as TlvToPrimitive[typeof typeLength.type]);
                    case TlvLength.EightBytes: return writer.writeUtf8String(value as TlvToPrimitive[typeof typeLength.type]);
                }
            case TlvType.ByteString:
                switch (typeLength.length) {
                    case TlvLength.OneByte: return writer.writeByteArray(value as TlvToPrimitive[typeof typeLength.type]);
                    case TlvLength.TwoBytes: return writer.writeByteArray(value as TlvToPrimitive[typeof typeLength.type]);
                    case TlvLength.FourBytes: return writer.writeByteArray(value as TlvToPrimitive[typeof typeLength.type]);
                    case TlvLength.EightBytes: return writer.writeByteArray(value as TlvToPrimitive[typeof typeLength.type]);
                }
            default:
                throw new Error(`Unexpected TLV type ${typeLength.type}`);
        }
    }
}

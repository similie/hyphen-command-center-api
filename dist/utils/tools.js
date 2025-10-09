import CryptoJS from "crypto-js";
import { generateUniqueUUID } from "@similie/hyphen-command-types";
export const generateUniqueId = (numBytes = 16) => {
    const wordArray = CryptoJS.lib.WordArray.random(numBytes);
    // Convert the WordArray to a hexadecimal string
    return wordArray.toString(CryptoJS.enc.Hex);
};
export const isUUID = (value) => {
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
    return regex.test(value);
};
export const mqttMessageIdentity = (payload) => {
    try {
        const value = JSON.parse(payload.toString());
        value._uid = generateUniqueUUID();
        return JSON.stringify(value);
    }
    catch {
        return payload.toString();
    }
};

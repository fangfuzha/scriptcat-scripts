/**
 * 脚本猫 / 油猴的全局 API 类型声明（框架共享层）。
 *
 * 各脚本如需额外类型，可在自己的 src/ 目录下另建 global.d.ts，
 * 但不要重复声明这里已有的名字。
 */

declare function GM_getValue(key: string, defaultValue?: unknown): unknown;
declare function GM_setValue(key: string, value: unknown): void;
declare function GM_deleteValue(key: string): void;
declare function GM_registerMenuCommand(caption: string, fn: () => void): void;

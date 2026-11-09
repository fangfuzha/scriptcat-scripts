/**
 * 共享存储层。
 *
 * 本仓库所有脚本统一使用 CAT_fileStorage 保存需要跨设备同步的数据。
 * 原因：脚本猫的云同步只覆盖脚本源码与 metadata，不包含 GM 存储值，
 * 所以存在 GM_setValue 里的设置无法在多端之间同步。
 * CAT_fileStorage 走的是用户自己配置的云盘（WebDAV / OneDrive / Google Drive /
 * Dropbox / 百度网盘 / S3），天然跨设备可达。
 *
 * 设计要点：
 * 1. 本地 GM 存储作为缓存，保证脚本启动时能立刻拿到数据（同步读取）；
 * 2. 云端读取是异步的，通过 onRemoteUpdate 回调把远端数据合并回来；
 * 3. 写入时先写本地再异步上传云端，失败不影响本地使用；
 * 4. 云端未配置（错误码 1）时自动退回纯本地模式，不影响脚本可用性。
 */

/** CAT_fileStorage 的文件信息 */
export interface FileStorageFileInfo {
  name: string;
  path: string;
  absPath: string;
  size: number;
  digest: string;
  createtime: number;
  updatetime: number;
}

/** CAT_fileStorage 的错误信息 */
export interface FileStorageError {
  /** -1 未知 1 未配置文件储存源 2 配置错误 3 路径不存在 4 上传失败 5 下载失败 6 删除失败 7 路径不允许 8 网络错误 */
  code: number;
  error: string;
}

declare function CAT_fileStorage(action: "list", details: {
  path?: string;
  baseDir?: string;
  onload?: (files: FileStorageFileInfo[]) => void;
  onerror?: (error: FileStorageError) => void;
}): void;
declare function CAT_fileStorage(action: "download", details: {
  file: FileStorageFileInfo;
  onload: (data: Blob) => void;
  onerror?: (error: FileStorageError) => void;
}): void;
declare function CAT_fileStorage(action: "upload", details: {
  path: string;
  baseDir?: string;
  data: Blob;
  onload?: () => void;
  onerror?: (error: FileStorageError) => void;
}): void;
declare function CAT_fileStorage(action: "delete", details: {
  path: string;
  onload?: () => void;
  onerror?: (error: FileStorageError) => void;
}): void;
declare function CAT_fileStorage(action: "config"): void;

/** 当前运行环境是否支持 CAT_fileStorage */
export function hasFileStorage(): boolean {
  return typeof CAT_fileStorage === "function";
}

export interface SyncStorageOptions<T> {
  /** 云端文件名，例如 settings.json */
  fileName: string;
  /** 云端基础目录，默认使用脚本自身的 uuid 目录 */
  baseDir?: string;
  /** 本地 GM 存储键 */
  localKey: string;
  /** 默认值 */
  defaults: T;
  /** 远端数据到达时回调，用于把云端配置应用到当前页面 */
  onRemoteUpdate?: (data: T) => void;
  /** 合并本地与远端数据，默认远端优先 */
  merge?: (local: T, remote: T) => T;
}

/**
 * 统一的同步存储。
 *
 * 用法：
 *   const store = new SyncStorage({
 *     fileName: "settings.json",
 *     localKey: "dark-mode-settings",
 *     defaults: DEFAULT_SETTINGS,
 *   });
 *   const settings = store.load();          // 同步返回本地缓存
 *   store.sync();                          // 异步从云端拉取并合并
 *   store.save(settings);                  // 写本地 + 异步上传云端
 */
export class SyncStorage<T> {
  private options: SyncStorageOptions<T>;
  private uploadTimer: number | null = null;
  private pendingData: T | null = null;

  constructor(options: SyncStorageOptions<T>) {
    this.options = options;
  }

  /** 同步读取本地缓存，未配置过则返回默认值 */
  load(): T {
    const raw = this.readLocal();
    if (raw === null) return { ...this.options.defaults };
    try {
      return { ...this.options.defaults, ...(raw as object) } as T;
    } catch {
      return { ...this.options.defaults };
    }
  }

  /** 读取本地原始值 */
  private readLocal(): unknown {
    if (typeof GM_getValue !== "function") return null;
    try {
      return GM_getValue(this.options.localKey, null);
    } catch {
      return null;
    }
  }

  /** 写入本地并异步上传云端 */
  save(data: T): void {
    this.writeLocal(data);
    this.scheduleUpload(data);
  }

  private writeLocal(data: T): void {
    if (typeof GM_setValue !== "function") return;
    try {
      GM_setValue(this.options.localKey, data);
    } catch {
      /* 本地写入失败不影响后续云端同步 */
    }
  }

  /**
   * 延迟上传，避免频繁改动时反复写云端。
   * 500ms 内的多次保存只会上传最后一次。
   */
  private scheduleUpload(data: T): void {
    if (!hasFileStorage()) return;
    this.pendingData = data;

    if (this.uploadTimer !== null) clearTimeout(this.uploadTimer);
    this.uploadTimer = window.setTimeout(() => {
      this.uploadTimer = null;
      const payload = this.pendingData;
      this.pendingData = null;
      if (payload !== null) this.upload(payload);
    }, 500);
  }

  /** 上传到云端 */
  private upload(data: T): void {
    if (!hasFileStorage()) return;
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      CAT_fileStorage("upload", {
        path: this.options.fileName,
        baseDir: this.options.baseDir,
        data: blob,
        onerror: (err) => {
          // 错误码 1 表示用户还没配置文件储存源，属于正常情况
          if (err && err.code !== 1) {
            console.warn("[同步存储] 上传失败:", err.error);
          }
        },
      });
    } catch (err) {
      console.warn("[同步存储] 上传异常:", err);
    }
  }

  /**
   * 从云端拉取并合并。
   *
   * 拉到的数据会写回本地缓存，并通过 onRemoteUpdate 通知调用方应用。
   */
  sync(): void {
    if (!hasFileStorage()) return;

    try {
      CAT_fileStorage("list", {
        baseDir: this.options.baseDir,
        onload: (files) => {
          const target = files.find((f) => f.name === this.options.fileName);
          if (!target) return;
          this.download(target);
        },
        onerror: (err) => {
          if (err && err.code !== 1) {
            console.warn("[同步存储] 读取文件列表失败:", err.error);
          }
        },
      });
    } catch (err) {
      console.warn("[同步存储] 同步异常:", err);
    }
  }

  /** 下载并解析指定文件 */
  private download(file: FileStorageFileInfo): void {
    try {
      CAT_fileStorage("download", {
        file,
        onload: (blob) => {
          void blob.text().then((text) => {
            try {
              const remote = JSON.parse(text) as T;
              this.applyRemote(remote);
            } catch (err) {
              console.warn("[同步存储] 解析云端数据失败:", err);
            }
          });
        },
        onerror: (err) => {
          if (err && err.code !== 1) {
            console.warn("[同步存储] 下载失败:", err.error);
          }
        },
      });
    } catch (err) {
      console.warn("[同步存储] 下载异常:", err);
    }
  }

  /** 把云端数据合并进本地并通知调用方 */
  private applyRemote(remote: T): void {
    const local = this.load();
    const merged = this.options.merge ? this.options.merge(local, remote) : ({ ...remote } as T);

    this.writeLocal(merged);
    this.options.onRemoteUpdate?.(merged);
  }

  /** 打开脚本猫的文件存储配置页 */
  static openConfig(): void {
    if (!hasFileStorage()) return;
    try {
      CAT_fileStorage("config");
    } catch {
      /* 忽略 */
    }
  }
}

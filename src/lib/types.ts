export interface ClipboardItem {
    id: string;
    type: "text" | "image" | "files" | "peer-file";
    content: string;
    files?: string[];
    fileId?: string;
    downloadUrl?: string;
    name?: string;
    size?: number;
    x: number;
    y: number;
    z: number;
    w?: number;
    h?: number;
    editing?: boolean;
    title?: string;
    editingTitle?: boolean;
    fontSize?: number;
}

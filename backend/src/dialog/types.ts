export interface ButtonOptions {
    text: string;
    value: string;
}

export interface StepDef {
    key: string;
    prompt: string;
    buttons?: ButtonOptions[][];
    parse?: (raw: string) => { ok: true; value: unknown } | { ok: false; error: string };
}

export interface DialogFlow {
    name: string;
    steps: StepDef[];
    onComplete: (chatId: string, data: Record<string, any>) => Promise<string>;
}
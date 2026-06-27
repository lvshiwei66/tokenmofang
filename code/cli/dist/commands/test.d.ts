import { Command } from "commander";
export interface ResolvedTestParams {
    /** Resolved single URL for the chat/completions endpoint */
    baseUrl: string;
    apiKey: string;
    model: string;
    prompt: string;
}
export declare function registerTestCommand(program: Command): void;
